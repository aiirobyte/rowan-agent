import { mkdir, chmod, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { createModelStream } from "@rowan-agent/models";
import type { AgentMessage, ModelRef } from "../protocol";
import type { StreamFn } from "@rowan-agent/models";
import { createId } from "../utils";
import { executeOnce } from "./execution";
import { ConfigCommandService } from "./config-commands";
import type {
  AgentConfig,
  AgentConfigRequest,
  AgentRecord,
  AgentRun,
  AgentRuntime as AgentRuntimeContract,
  AgentRuntimeOptions,
  AgentSummary,
  DurableConsumer,
  DurableRunEvent,
  EventCursor,
  Page,
  RunBoundary,
  RunEvent,
  RunRecord,
  RunSnapshot,
  RunState,
  RunSummary,
  MessageRevisionResult,
  HistorySeed,
  Tool as DurableTool,
  UserInput,
  InvocationCatalogEntry,
  InvocationSource,
  ContextCompactionRecord,
  ContextStatus,
  Metadata,
} from "./contracts";
import {
  assertToolExecutionResult,
  isAgentConfiguration,
  thinkingLevelFromMessages,
} from "./contracts";
import type { AgentId, AssistantMessage, ExecutionId, JsonValue, MessageId, OutcomeId, RunId, RunFailure, ToolCallId, UserContent } from "../runtime-events";
import { RuntimeError } from "./errors";
import { pageAgents, pageRuns } from "./read-models";
import { projectAssistantMessage, projectModelContext } from "./model-context";
import { assembleRegisteredExtensions } from "./extensions";
import { InMemoryConfigProvider } from "./config-provider";
import { createCorePhases, COMPACT_PHASE_ID, DEFAULT_PHASE_ID } from "../harness/phases/core-phases";
import type { PhaseRegistry } from "../harness/phases/types";
import type { AgentRuntimePort } from "../loop/types";
import type { ToolCall, ToolResult } from "../protocol";
import { assertJsonValue, isJsonValue } from "./json";
import { TransientRunEventHub } from "./transient-run-events";
import {
  type LoadInput,
  type LoadResult,
  type ResourceKind,
} from "./resource-registry";
import { RuntimeBootstrapRegistry } from "./extension-lifetime";
import type { AgentDefinition } from "../harness/definitions";
import type { Phase } from "../harness/phases/types";
import type { Skill } from "../protocol";
import { materializeConfigurationSnapshot, resolveConfigurationSnapshot } from "./configuration-snapshot";

const DEFAULT_CONCURRENCY = 10;
const DEFAULT_POLL_MS = 25;
const MAX_CONSUMER_IDLE_POLL_MS = 250;
const OWNER_LEASE_MS = 30_000;
const OWNER_RENEWAL_MS = 10_000;
const MAX_INLINE_TOOL_RESULT_BYTES = 16 * 1024;

type Deferred<T = void> = {
  promise: Promise<T>;
  resolve(value?: T | PromiseLike<T>): void;
  reject(error: unknown): void;
};

type ConsumerSubscription = {
  consumerId: string;
  controller: AbortController;
  input: {
    consumerId: string;
    signal: AbortSignal;
    onEvent(event: DurableRunEvent, context: Readonly<{ signal: AbortSignal }>): void | Promise<void>;
  };
  caughtUp: Deferred;
  done: Deferred;
};

type ActiveExecution = Readonly<{
  controller: AbortController;
  executionId: ExecutionId;
}>;

type ExecutionToolConfig = Readonly<{
  tools: readonly DurableTool[];
  beforeToolCall?: AgentConfig["beforeToolCall"];
  afterToolCall?: AgentConfig["afterToolCall"];
}>;

/** Keep large custom Tool Results out of the model transcript while retaining
 * the complete payload in the per-Agent durable archive. Core read/bash Tools
 * already provide their own richer spill format and are left untouched. */
async function spillLargeToolResult(
  result: import("./contracts").ToolExecutionResult,
  archiveDir: string | undefined,
  toolName: string,
): Promise<import("./contracts").ToolExecutionResult> {
  if (!archiveDir) return result;
  const serialized = typeof result.content === "string"
    ? result.content
    : JSON.stringify(result.content, null, 2);
  if (serialized === undefined) return result;
  const bytes = new TextEncoder().encode(serialized);
  if (bytes.byteLength <= MAX_INLINE_TOOL_RESULT_BYTES || /\nFull result:\s+\S+/.test(serialized)) {
    return result;
  }
  const toolDir = archiveDir;
  await mkdir(toolDir, { recursive: true, mode: 0o700 });
  await chmod(toolDir, 0o700).catch(() => undefined);
  const safeToolName = toolName.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const path = join(toolDir, `rowan-${safeToolName}-${Date.now()}-${randomUUID()}.log`);
  await writeFile(path, serialized, { encoding: "utf8", mode: 0o600 });
  await chmod(path, 0o600).catch(() => undefined);
  const preview = new TextDecoder().decode(bytes.subarray(0, MAX_INLINE_TOOL_RESULT_BYTES));
  return {
    ...result,
    content: `${preview}\n[truncated]\nFull result: ${path}\nOffset: 0`,
  };
}

export class AgentRuntime implements AgentRuntimeContract {
  private readonly concurrency: number;
  private readonly owned: import("./contracts").OwnedStore;
  private readonly commands: ConfigCommandService;
  private readonly storeIncarnation: string;
  private readonly activeAgents = new Set<AgentId>();
  private readonly executions = new Map<RunId, ActiveExecution>();
  private readonly executionDone = new Map<RunId, Promise<void>>();
  private readonly cancellationRequested = new Set<RunId>();
  private readonly cancellationReasons = new Map<RunId, string>();
  private readonly autoCompactionRuns = new Set<RunId>();
  private readonly consumers = new Map<string, ConsumerSubscription>();
  private readonly transientEvents = new TransientRunEventHub();
  private readonly resources: RuntimeBootstrapRegistry;
  private heartbeat?: ReturnType<typeof setInterval>;
  private pumping = false;
  private closed = false;

  private constructor(
    options: AgentRuntimeOptions & { configs: import("./contracts").ConfigProvider },
    owned: import("./contracts").OwnedStore,
    resources: RuntimeBootstrapRegistry,
  ) {
    this.owned = owned;
    this.commands = new ConfigCommandService(owned, options.configs, String(owned.lease.token).split(":")[0]!);
    this.storeIncarnation = String(owned.lease.token).split(":")[0]!;
    this.concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
    this.resources = resources;
  }

  static async init(options: AgentRuntimeOptions): Promise<AgentRuntime> {
    if (!options.store) throw new TypeError("AgentRuntime requires a DurableStore");
    const configs = options.configs ?? new InMemoryConfigProvider();
    const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
    if (!Number.isInteger(concurrency) || concurrency <= 0) throw new TypeError("concurrency must be a positive integer");
    const owned = await options.store.openOwner({ ownerId: createId("owner"), leaseMs: OWNER_LEASE_MS });
    const runtime = new AgentRuntime({ ...options, configs, concurrency }, owned, new RuntimeBootstrapRegistry());
    try {
      await runtime.resources.ensureCoreResources();
      await options.bootstrap?.(runtime.resources);
      runtime.startHeartbeat();
      void runtime.pump();
      return runtime;
    } catch (error) {
      await runtime.resources.closeExtensions().catch(() => undefined);
      await owned.sealAndReleaseOwner().catch(() => undefined);
      throw error;
    }
  }

  async loadAgents(input: LoadInput<AgentDefinition>): Promise<LoadResult> {
    this.assertOpen();
    return this.resources.loadAgents(input);
  }

  async loadSkills(input: LoadInput<Skill>): Promise<LoadResult> {
    this.assertOpen();
    return this.resources.loadSkills(input);
  }

  async loadPhases(input: LoadInput<Phase>): Promise<LoadResult> {
    this.assertOpen();
    return this.resources.loadPhases(input);
  }

  async loadTools(input: Readonly<{ sourceId: string; values: readonly DurableTool[] }>): Promise<LoadResult> {
    this.assertOpen();
    return this.resources.loadTools(input);
  }

  async unload(input: Readonly<{ kind: ResourceKind; sourceId: string }>): Promise<LoadResult> {
    this.assertOpen();
    return this.resources.unload(input);
  }

  async createAgent(config: AgentConfigRequest, options: { idempotencyKey?: string; metadata?: import("../runtime-events").Metadata; historySeed?: HistorySeed } = {}): Promise<AgentId> {
    this.assertOpen();
    return this.commands.createAgent({
      config,
      ...(options.metadata === undefined ? {} : { metadata: options.metadata }),
      ...(options.historySeed === undefined ? {} : { historySeed: options.historySeed }),
      idempotencyKey: options.idempotencyKey ?? crypto.randomUUID(),
    });
  }

  async updateAgentConfig(agentId: AgentId, config: AgentConfigRequest, options: { idempotencyKey: string }): Promise<void> {
    this.assertOpen();
    await this.commands.updateAgentConfig({ agentId, config, idempotencyKey: options.idempotencyKey });
  }

  async deleteAgent(input: import("./contracts").AgentDeletionRequest): Promise<void> {
    this.assertOpen();
    const runs = await this.owned.listRuns({ agentId: input.agentId });
    for (const run of runs) {
      if (["queued", "running", "input_required"].includes(run.state)) {
        await this.cancel(run.id, "Agent deleted.");
      }
    }
    await this.owned.deleteAgent(input);
  }

  async revise(agentId: AgentId, input: {
    messageId: MessageId;
    expectedMessageRevision: number;
    content: UserContent;
    operationId: string;
    effectDigestConfirmation?: string;
  }): Promise<MessageRevisionResult> {
    this.assertOpen();
    const result = await this.owned.reviseMessage({ agentId, ...input });
    for (const runId of result.invalidatedRunIds) {
      const execution = this.executions.get(runId);
      if (execution) {
        execution.controller.abort();
        this.transientEvents.clear(runId, execution.executionId);
      }
    }
    void this.pump();
    return result;
  }

  async compact(input: { now?: string; retentionMs?: number } = {}) {
    this.assertOpen();
    return this.owned.compact(input);
  }

  async contextStatus(agentId: AgentId, options: { contextWindow?: number } = {}): Promise<ContextStatus> {
    this.assertOpen();
    const agent = await this.requireAgent(agentId);
    const contextWindow = options.contextWindow ?? await this.resolveContextWindow(agent);
    return this.owned.contextStatus(agentId, contextWindow);
  }

  async compactContext(agentId: AgentId, options: { input?: UserInput; instructions?: string; idempotencyKey?: string } = {}): Promise<AgentRun> {
    this.assertOpen();
    const agent = await this.requireAgent(agentId);
    if (!agent.activatedAt || !agent.currentConfigToken) throw new RuntimeError("agent_not_found", { agentId });
    const active = (await this.owned.listRuns({ agentId }))
      .filter((run) => ["queued", "running", "input_required"].includes(run.state));
    const existing = active.find((run) => controlRunKind(run) === "compact");
    if (existing) return new DurableRun(this, existing.id);
    // An input-required Run is paused and does not consume the execution
    // slot; manual compaction is explicitly allowed while it waits for the
    // next user input. Only queued/running work blocks a Control Run.
    const blocking = active.find((run) => run.state === "queued" || run.state === "running");
    if (blocking) throw new RuntimeError("context_busy", { agentId, runId: blocking.id, actual: blocking.state });
    const metadata: Metadata = {
      rowan: {
        kind: "compact",
        ...(options.instructions === undefined ? {} : { instructions: options.instructions }),
      },
    };
    const run = await this.owned.createRun({
      agentId,
      // An empty input is a system-triggered Control Run. A non-empty input
      // represents a user invocation and is committed by the Durable Store.
      input: options.input ?? "",
      metadata,
      idempotencyKey: options.idempotencyKey ?? createId("compact"),
    });
    void this.pump();
    return new DurableRun(this, run.id);
  }

  async start(agentId: AgentId, input: UserInput, options: { idempotencyKey: string; metadata?: import("../runtime-events").Metadata }): Promise<AgentRun> {
    this.assertOpen();
    const agent = await this.requireAgent(agentId);
    if (!agent.activatedAt || !agent.currentConfigToken) throw new RuntimeError("agent_not_found", { agentId });
    const run = await this.owned.createRun({ agentId, input, ...(options.metadata === undefined ? {} : { metadata: options.metadata }), idempotencyKey: options.idempotencyKey });
    void this.pump();
    return new DurableRun(this, run.id);
  }

  run(runId: RunId): AgentRun {
    return new DurableRun(this, runId);
  }

  async listAgents(input: { after?: import("../runtime-events").AgentListCursor; limit?: number } = {}): Promise<Page<AgentSummary, import("../runtime-events").AgentListCursor>> {
    this.assertOpen();
    return pageAgents(await this.owned.listAgents(), { ...input, storeIncarnation: this.storeIncarnation });
  }

  async listRuns(input: { agentId?: AgentId; states?: readonly RunState[]; after?: import("../runtime-events").RunListCursor; limit?: number } = {}): Promise<Page<RunSummary, import("../runtime-events").RunListCursor>> {
    this.assertOpen();
    return pageRuns(await this.owned.listRuns(input), { ...input, storeIncarnation: this.storeIncarnation });
  }

  async listInvocations(agentId: AgentId, options: { source: InvocationSource }): Promise<readonly InvocationCatalogEntry[]> {
    this.assertOpen();
    if (!options || !["auto", "implicit", "external"].includes(options.source)) {
      throw new TypeError("options.source must be auto, implicit, or external");
    }
    const agent = await this.requireAgent(agentId);
    if (!agent.currentConfigToken) throw new RuntimeError("agent_not_found", { agentId });
    const resolution = await this.commands.resolve({ agent, token: agent.currentConfigToken });
    if (resolution.kind !== "available") {
      throw new RuntimeError("configuration_unavailable", {
        agentId,
        retryable: resolution.kind === "deferred",
        reason: resolution.kind === "deferred" ? "Configuration is deferred." : resolution.reason,
      });
    }
    const config = isAgentConfiguration(resolution.config)
      ? this.materializeConfig(resolution.config)
      : resolution.config;
    const assembly = assembleRegisteredExtensions(config, this.resources.extensionRunner, {
      toolArchiveDir: this.archiveDirFor(agentId),
    });
    const phases = [...(assembly.context.phases?.phases.values() ?? [])]
      .filter((phase) => options.source === "external"
        || (options.source === "auto" ? !phase.disableAutoInvocation : !phase.disableImplicitInvocation))
      .filter((phase) => options.source !== "implicit" || phase.name !== DEFAULT_PHASE_ID);
    const skills = assembly.context.skills.filter((skill) => options.source === "external"
      || (options.source === "auto"
        ? !(skill.disableAutoInvocation ?? skill.disableModelInvocation)
        : !skill.disableImplicitInvocation));
    return [
      ...phases.map((phase) => ({
        kind: "phase" as const,
        name: phase.name,
        description: phase.description,
        ...(phase.input === undefined ? {} : { input: phase.input }),
        ...(phase.core ? { core: true } : {}),
        disableAutoInvocation: phase.disableAutoInvocation ?? false,
        disableImplicitInvocation: phase.disableImplicitInvocation ?? false,
        filePath: phase.filePath,
      })),
      ...skills.map((skill) => ({
        kind: "skill" as const,
        name: skill.name,
        description: skill.description,
        disableAutoInvocation: skill.disableAutoInvocation ?? skill.disableModelInvocation ?? false,
        disableImplicitInvocation: skill.disableImplicitInvocation ?? false,
        filePath: skill.filePath,
      })),
    ];
  }

  async consume(input: { consumerId: string; signal: AbortSignal; onEvent(event: DurableRunEvent, context: Readonly<{ signal: AbortSignal }>): void | Promise<void> }): Promise<DurableConsumer> {
    this.assertOpen();
    if (input.consumerId.trim().length === 0) throw new TypeError("consumerId must be non-empty");
    if (input.signal.aborted) throw abortError();
    if (this.consumers.has(input.consumerId)) throw new RuntimeError("consumer_already_active", { consumerId: input.consumerId });
    const controller = new AbortController();
    const subscription: ConsumerSubscription = { consumerId: input.consumerId, controller, input, caughtUp: deferred(), done: deferred() };
    this.consumers.set(input.consumerId, subscription);
    const onAbort = () => controller.abort();
    input.signal.addEventListener("abort", onAbort, { once: true });
    void this.runConsumer(subscription).catch((error) => {
      subscription.caughtUp.reject(error);
    }).finally(() => {
      input.signal.removeEventListener("abort", onAbort);
      this.consumers.delete(input.consumerId);
      subscription.done.resolve();
    });
    return { caughtUp: subscription.caughtUp.promise, done: subscription.done.promise, stop: () => controller.abort() };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const execution of this.executions.values()) execution.controller.abort();
    this.executions.clear();
    this.transientEvents.close();
    for (const subscription of this.consumers.values()) subscription.controller.abort();
    await this.resources.closeExtensions();
    await this.owned.sealAndReleaseOwner();
  }

  async snapshot(runId: RunId): Promise<RunSnapshot> {
    this.assertOpen();
    return this.owned.snapshotRun(runId);
  }

  async history(agentId: AgentId): Promise<readonly import("../runtime-events").Message[]> {
    this.assertOpen();
    return this.owned.history(agentId);
  }

  async respond(runId: RunId, input: { requestId: import("../runtime-events").InputRequestId; input: UserInput }): Promise<void> {
    this.assertOpen();
    const snapshot = await this.owned.snapshotRun(runId);
    if (snapshot.state !== "input_required" || snapshot.request.id !== input.requestId) {
      throw new RuntimeError("input_request_conflict", { runId, requestId: input.requestId, reason: "not_found" });
    }
    await this.owned.answerInput({ runId, requestId: input.requestId, expectedRevision: snapshot.revision, input: input.input });
    void this.pump();
  }

  async respondInteraction(runId: RunId, input: { interactionId: string; input: JsonValue }): Promise<void> {
    this.assertOpen();
    const snapshot = await this.owned.snapshotRun(runId);
    if (snapshot.state !== "input_required" || !snapshot.interactions.some((interaction) => interaction.id === input.interactionId)) {
      throw new RuntimeError("input_request_conflict", { runId, requestId: input.interactionId as import("../runtime-events").InputRequestId, reason: "not_found" });
    }
    await this.owned.answerInteraction({ runId, interactionId: input.interactionId, expectedRevision: snapshot.revision, input: input.input });
    void this.pump();
  }

  async cancel(runId: RunId, reason?: string): Promise<RunBoundary> {
    this.assertOpen();
    const done = this.executionDone.get(runId);
    if (done) {
      this.cancellationRequested.add(runId);
      this.cancellationReasons.set(runId, reason ?? "Agent run stopped.");
      this.executions.get(runId)?.controller.abort();
      await done;
      return boundaryFromSnapshot(await this.owned.snapshotRun(runId));
    }
    const snapshot = await this.owned.snapshotRun(runId);
    await this.owned.cancelRun({ runId, expectedRevision: snapshot.revision, ...(reason === undefined ? {} : { reason }) });
    const active = this.executions.get(runId);
    if (active) this.transientEvents.clear(runId, active.executionId);
    active?.controller.abort();
    return boundaryFromSnapshot(await this.owned.snapshotRun(runId));
  }

  private async pump(): Promise<void> {
    if (this.pumping || this.closed) return;
    this.pumping = true;
    try {
      while (!this.closed && this.executions.size < this.concurrency) {
        const queued = await this.owned.listRuns({ states: ["queued"] });
        const next = queued
          .filter((run) => !this.activeAgents.has(run.agentId))
          .sort((left, right) => Number(controlRunKind(right) === "compact") - Number(controlRunKind(left) === "compact"))[0];
        if (!next) return;
        this.activeAgents.add(next.agentId);
        const task = this.execute(next).finally(() => {
          const execution = this.executions.get(next.id);
          if (execution) this.transientEvents.clear(next.id, execution.executionId, true);
          this.activeAgents.delete(next.agentId);
          this.executions.delete(next.id);
          this.cancellationRequested.delete(next.id);
          this.cancellationReasons.delete(next.id);
          void this.owned.snapshotRun(next.id).then((snapshot) => {
            if (snapshot.state !== "queued") this.autoCompactionRuns.delete(next.id);
          }).catch(() => undefined);
          this.executionDone.delete(next.id);
          void this.pump();
        });
        this.executionDone.set(next.id, task);
        void task;
      }
    } catch (error) {
      if (error instanceof RuntimeError && error.code === "runtime_ownership_lost") {
        for (const execution of this.executions.values()) execution.controller.abort();
        return;
      }
      throw error;
    } finally {
      this.pumping = false;
    }
  }

  private async execute(run: RunRecord): Promise<void> {
    let claim: import("./contracts").RunClaim | undefined;
    let executionRevision = run.revision;
    try {
      const agent = await this.requireAgent(run.agentId);
      let token = run.pinnedConfigToken ?? agent.currentConfigToken;
      if (!token) {
        await this.failQueued(run, "Agent has no Config Token.");
        return;
      }
      let resolution;
      try {
        resolution = await this.commands.resolve({ agent, token });
      } catch (error) {
        await this.failQueued(run, error instanceof Error ? error.message : "Config Provider failed.");
        return;
      }
      if (resolution.kind === "deferred") {
        setTimeout(() => void this.pump(), Math.min(1_000, Math.max(0, resolution.retryAfterMs ?? DEFAULT_POLL_MS)));
        return;
      }
      if (resolution.kind === "unavailable") {
        await this.failQueued(run, resolution.reason);
        return;
      }
      let resolvedConfig = resolution.config;
      if (isAgentConfiguration(resolvedConfig)) {
        try {
          const snapshot = this.materializeConfig(resolvedConfig);
          token = await this.commands.storeSnapshot({
            agent,
            config: snapshot,
            operationId: `run-snapshot:${run.id}`,
          });
          resolvedConfig = snapshot;
        } catch (error) {
          await this.failQueued(run, error instanceof Error ? error.message : "Configuration Snapshot failed.");
          return;
        }
      }
      const config = resolvedConfig as AgentConfig;
      const controlKind = controlRunKind(run);
      if (!controlKind && !this.autoCompactionRuns.has(run.id)) {
        const contextWindow = await resolveContextWindowForConfig(config);
        const status = await this.owned.contextStatus(run.agentId, contextWindow);
        const inputTokens = estimateRunInputTokens(run.input);
        if (status.thresholdTokens > 0 && status.tokens + inputTokens >= status.thresholdTokens) {
          this.autoCompactionRuns.add(run.id);
          await this.owned.createRun({
            agentId: run.agentId,
            input: "",
            metadata: {
              rowan: {
                kind: "compact",
                trigger: "auto",
                sourceRunId: String(run.id),
              },
            },
            idempotencyKey: `auto-compact:${run.id}`,
          });
          return;
        }
      }
      const executionId = createId("exec") as import("../runtime-events").ExecutionId;
      claim = await this.owned.claimRun({
        runId: run.id,
        expectedRevision: run.revision,
        executionId,
        configToken: token,
      });
      executionRevision = claim.run.revision;
      const controller = new AbortController();
      this.executions.set(run.id, { controller, executionId });
      if (this.cancellationRequested.has(run.id)) controller.abort();
      const assembly = assembleRegisteredExtensions(config, this.resources.extensionRunner, {
        toolArchiveDir: this.archiveDirFor(run.agentId),
      });
      let toolQueue = Promise.resolve();
      const model = "stream" in config && config.stream
        ? config.model as ModelRef
        : { provider: config.model.provider, id: config.model.id } satisfies ModelRef;
      const stream = "stream" in config && config.stream ? config.stream as StreamFn : createModelStream(config.model as never);
      const phaseRegistry = normalizePhaseRegistry(assembly.context.phases);
      let modelMessages = await this.owned.contextMessages(run.agentId);
      const buildExecutionContext = (messages: readonly import("../runtime-events").Message[], phaseId?: string) => {
        const executionContext = projectModelContext({
          context: {
            ...assembly.context,
            phases: phaseRegistry,
          },
          messages,
          agentId: run.agentId,
          runId: run.id,
        });
        if (phaseId === COMPACT_PHASE_ID || controlKind === "compact") {
          executionContext.phases = {
            ...executionContext.phases!,
            entryPhaseId: COMPACT_PHASE_ID,
          };
        }
        return executionContext;
      };
      let executionContext = buildExecutionContext(modelMessages);
      const executionTools: ExecutionToolConfig = {
        tools: assembly.context.tools,
        beforeToolCall: assembly.beforeToolCall ?? config.beforeToolCall,
        afterToolCall: assembly.afterToolCall ?? config.afterToolCall,
      };
      const executeModel = (context: ReturnType<typeof buildExecutionContext>) => executeOnce({
        canonicalMessages: context.messages,
        context,
        execution: {
          agentId: run.agentId,
          runId: run.id,
          executionId: claim!.execution.executionId,
          input: typeof run.input === "string" ? run.input : run.input.content,
          ...(agent.metadata === undefined ? {} : { agentMetadata: agent.metadata }),
          ...(run.metadata === undefined ? {} : { runMetadata: run.metadata }),
        },
        model,
        thinkingLevel: thinkingLevelFromMessages(context.messages),
        stream,
        maxAttempts: config.maxAttempts,
        checkpoint: claim!.run.checkpoint,
        interactionAnswers: claim!.run.interactionAnswers,
        signal: controller.signal,
        beforePhase: assembly.beforePhase,
        afterPhase: assembly.afterPhase,
        beforePrompt: assembly.beforePrompt,
        onPhaseStatus: (phaseId, status) => {
          const active = this.executions.get(run.id);
          if (active?.executionId !== claim!.execution.executionId) return;
          this.transientEvents.publish({
            kind: "phase_status",
            durability: "transient",
            runId: run.id,
            executionId: claim!.execution.executionId,
            phaseId,
            status,
          });
        },
        onMessageDelta: (event) => {
          const active = this.executions.get(run.id);
          if (
            this.closed
            || controller.signal.aborted
            || active?.executionId !== claim!.execution.executionId
          ) return;
          this.transientEvents.publish({
            kind: "message_delta",
            durability: "transient",
            runId: run.id,
            executionId: claim!.execution.executionId,
            messageId: event.messageId as MessageId,
            offset: event.offset,
            text: event.text,
          });
        },
        onThinkingDelta: (event) => {
          const active = this.executions.get(run.id);
          if (
            this.closed
            || controller.signal.aborted
            || active?.executionId !== claim!.execution.executionId
          ) return;
          this.transientEvents.publish({
            kind: "thinking_delta",
            durability: "transient",
            runId: run.id,
            executionId: claim!.execution.executionId,
            messageId: event.messageId as MessageId,
            blockIndex: event.blockIndex,
            offset: event.offset,
            text: event.text,
          });
        },
        onContext: assembly.setContext,
        runtime: {
          tools: ({ toolCall }: { config: import("../loop/types").AgentConfig; toolCall: ToolCall }) => {
            const task = toolQueue.then(async () => {
              const execution = await this.executeToolBatch({
                run,
                agentMetadata: agent.metadata,
                execution: claim!.execution,
                expectedRevision: executionRevision,
                toolConfig: executionTools,
                toolCalls: [toolCall],
                signal: controller.signal,
              });
              executionRevision = execution.revision;
              return execution.results[0]!;
            });
            toolQueue = task.then(() => undefined, () => undefined);
            return task;
          },
          toolsBatch: ({ toolCalls }: { config: import("../loop/types").AgentConfig; toolCalls: readonly ToolCall[] }) => {
            const task = toolQueue.then(async () => {
              const execution = await this.executeToolBatch({
                run,
                agentMetadata: agent.metadata,
                execution: claim!.execution,
                expectedRevision: executionRevision,
                toolConfig: executionTools,
                toolCalls,
                signal: controller.signal,
              });
              executionRevision = execution.revision;
              return execution.results;
            });
            toolQueue = task.then(() => undefined, () => undefined);
            return task;
          },
        } satisfies AgentRuntimePort,
      });
      let result = await executeModel(executionContext);
      if (!controlKind && result.type === "failed" && isContextOverflowError(result.error)) {
        const compactContext = buildExecutionContext(await this.owned.contextMessages(run.agentId), COMPACT_PHASE_ID);
        const compactResult = await executeModel(compactContext);
        const summary = compactResult.type === "completed" ? compactSummary(compactResult.outcome.payload) : undefined;
        if (summary) {
          const covered = claim.history.at(-1);
          await this.owned.commitContextCompaction({
            id: createId("compact"),
            agentId: run.agentId,
            summary,
            ...(covered ? { coveredThrough: { messageId: covered.id, sequence: covered.sequenceWithinRun } } : {}),
            createdAt: new Date().toISOString(),
          });
          modelMessages = await this.owned.contextMessages(run.agentId);
          executionContext = buildExecutionContext(modelMessages);
          result = await executeModel(executionContext);
        }
      }
      if (this.cancellationRequested.has(run.id) || controller.signal.aborted) {
        const output = latestAssistant(run, result.messages, modelMessages.length, true);
        const reason = this.cancellationReasons.get(run.id) ?? "Agent run stopped.";
        await this.owned.cancelRun({
          runId: run.id,
          expectedRevision: executionRevision,
          reason,
          ...(output && hasVisibleAssistantText(output) ? { output } : {}),
        });
        this.transientEvents.clear(run.id, claim.execution.executionId);
        return;
      }
      if (result.type === "input_required") {
        const output = latestAssistant(
          run,
          result.messages.slice(modelMessages.length),
          modelMessages.length,
        );
        const prompt = output ?? promptMessage(run, result.request.prompt, result.messages.length);
        await this.owned.commitInputRequired({
          runId: run.id,
          execution: claim.execution,
          expectedRevision: executionRevision,
          requestId: createId("input") as import("../runtime-events").InputRequestId,
          phase: result.request.phase,
          prompt,
          checkpoint: result.checkpoint,
          interactions: result.interactions,
          interactionAnswers: claim.run.interactionAnswers,
        });
        this.transientEvents.clear(run.id, claim.execution.executionId);
        return;
      }
      if (result.type === "completed") {
        const output = latestAssistant(run, result.messages.slice(modelMessages.length), modelMessages.length);
        if (controlKind === "compact" || isCompactionOutcome(result.outcome.payload)) {
          const summary = compactSummary(result.outcome.payload);
          const instructions = compactInstructions(run)
            ?? compactOutputInstructions(result.outcome.payload);
          if (summary) {
            const covered = claim.history.at(-1);
            const record: ContextCompactionRecord = {
              id: createId("compact"),
              agentId: run.agentId,
              summary,
              ...(covered ? { coveredThrough: { messageId: covered.id, sequence: covered.sequenceWithinRun } } : {}),
              ...(instructions ? { instructions } : {}),
              createdAt: new Date().toISOString(),
            };
            await this.owned.commitContextCompaction(record);
          }
        }
        await this.owned.commitOutcome({ runId: run.id, execution: claim.execution, expectedRevision: executionRevision, outcome: durableOutcome(result.outcome), ...(output ? { output } : {}) });
        this.transientEvents.clear(run.id, claim.execution.executionId, true);
        return;
      }
      const failure: RunFailure = { code: "execution_failed", message: result.error instanceof Error ? result.error.message : "Execution failed." };
      await this.owned.commitOutcome({ runId: run.id, execution: claim.execution, expectedRevision: executionRevision, failure });
      this.transientEvents.clear(run.id, claim.execution.executionId);
    } catch (error) {
      if (!claim && error instanceof RuntimeError && ["run_state_conflict", "runtime_ownership_lost", "run_not_found"].includes(error.code)) return;
      if (claim) {
        if (this.cancellationRequested.has(run.id)) {
          await this.owned.cancelRun({
            runId: run.id,
            expectedRevision: executionRevision,
            reason: this.cancellationReasons.get(run.id) ?? "Agent run stopped.",
          }).catch(() => undefined);
          return;
        }
        await this.owned.commitOutcome({
          runId: run.id,
          execution: claim.execution,
          expectedRevision: executionRevision,
          failure: { code: "execution_failed", message: error instanceof Error ? error.message : "Execution failed." },
        }).catch(() => undefined);
        return;
      }
      throw error;
    }
  }

  private async failQueued(run: RunRecord, message: string): Promise<void> {
    await this.owned.failQueuedRun({ runId: run.id, expectedRevision: run.revision, failure: { code: "configuration_unavailable", message } }).catch((error) => {
      if (!(error instanceof RuntimeError) || !["run_state_conflict", "runtime_ownership_lost", "run_not_found"].includes(error.code)) throw error;
    });
  }

  private async resolveContextWindow(agent: AgentRecord): Promise<number> {
    if (!agent.currentConfigToken) return 128_000;
    const resolution = await this.commands.resolve({ agent, token: agent.currentConfigToken });
    if (resolution.kind !== "available") return 128_000;
    const config = isAgentConfiguration(resolution.config)
      ? this.materializeConfig(resolution.config)
      : resolution.config;
    return resolveContextWindowForConfig(config);
  }

  private async executeTool(input: {
    run: RunRecord;
    agentMetadata?: import("../runtime-events").Metadata;
    execution: import("./contracts").ExecutionToken;
    expectedRevision: number;
    toolConfig: ExecutionToolConfig;
    toolCall: ToolCall;
    signal: AbortSignal;
  }): Promise<{ result: ToolResult; revision: number }> {
    const batch = await this.executeToolBatch({ ...input, toolCalls: [input.toolCall] });
    return { result: batch.results[0]!, revision: batch.revision };
  }

  private async executeToolBatch(input: {
    run: RunRecord;
    agentMetadata?: import("../runtime-events").Metadata;
    execution: import("./contracts").ExecutionToken;
    expectedRevision: number;
    toolConfig: ExecutionToolConfig;
    toolCalls: readonly ToolCall[];
    signal: AbortSignal;
  }): Promise<{ results: readonly ToolResult[]; revision: number }> {
    const reserved = await this.owned.reserveToolCalls({
      runId: input.run.id,
      execution: input.execution,
      expectedRevision: input.expectedRevision,
      requestMessageId: createId("msg") as MessageId,
      calls: input.toolCalls.map((toolCall) => ({
        providerToolCallId: toolCall.id,
        name: toolCall.name,
        args: toJsonValue(toolCall.args),
      })),
    });
    let revision = reserved.run.revision;
    const results: ToolResult[] = [];
    for (let index = 0; index < input.toolCalls.length; index += 1) {
      const toolCall = input.toolCalls[index]!;
      const tool = reserved.toolCalls[index]!;
      const execution = await this.executeReservedTool({
        ...input,
        toolCall,
        tool,
        expectedRevision: revision,
      });
      revision = execution.revision;
      results.push(execution.result);
    }
    return { results, revision };
  }

  private async executeReservedTool(input: {
    run: RunRecord;
    agentMetadata?: import("../runtime-events").Metadata;
    execution: import("./contracts").ExecutionToken;
    expectedRevision: number;
    toolConfig: ExecutionToolConfig;
    toolCall: ToolCall;
    tool: import("../runtime-events").ToolCallSnapshot;
    signal: AbortSignal;
  }): Promise<{ result: ToolResult; revision: number }> {
    const durableTool = input.toolConfig.tools.find((candidate) => candidate.name === input.toolCall.name);
    const providerToolCallId = input.toolCall.id;
    const toolCallId = input.tool.id;
    let revision = input.expectedRevision;
    const protocolFailure = (error: string): ToolResult => ({ toolCallId: providerToolCallId, toolName: input.toolCall.name, ok: false, content: null, error });
    if (!durableTool) {
      const failed = await this.owned.commitToolResult({ runId: input.run.id, execution: input.execution, expectedRevision: revision, toolCallId, state: "failed", result: { ok: false, content: null, error: `Tool ${input.toolCall.name} is not available.` } });
      return { result: protocolFailure(`Tool ${input.toolCall.name} is not available.`), revision: failed.run.revision };
    }

    let progressActive = false;
    const context = {
      agentId: input.run.agentId,
      runId: input.run.id,
      ...(input.agentMetadata === undefined ? {} : { agentMetadata: input.agentMetadata }),
      ...(input.run.metadata === undefined ? {} : { runMetadata: input.run.metadata }),
      toolCallId,
      reportProgress: (progress: JsonValue) => {
        const active = this.executions.get(input.run.id);
        if (
          !progressActive
          || this.closed
          || input.signal.aborted
          || active?.executionId !== input.execution.executionId
          || !isJsonValue(progress)
        ) return;
        let copy: JsonValue;
        try {
          if (JSON.stringify(progress).length > 64 * 1024) return;
          copy = structuredClone(progress);
        } catch {
          return;
        }
        this.transientEvents.publish({
          kind: "tool_progress",
          durability: "transient",
          runId: input.run.id,
          executionId: input.execution.executionId,
          toolCallId,
          progress: copy,
        });
      },
    } as const;
    try {
      if (input.toolConfig.beforeToolCall) {
        const decision = await input.toolConfig.beforeToolCall({ tool: durableTool, args: toJsonValue(input.toolCall.args), context, signal: input.signal });
        if (!decision.allow) {
          const failed = await this.owned.commitToolResult({ runId: input.run.id, execution: input.execution, expectedRevision: revision, toolCallId, state: "failed", result: { ok: false, content: null, error: decision.reason } });
          return { result: protocolFailure(decision.reason), revision: failed.run.revision };
        }
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Tool policy rejected the call.";
      const failed = await this.owned.commitToolResult({ runId: input.run.id, execution: input.execution, expectedRevision: revision, toolCallId, state: "failed", result: { ok: false, content: null, error: reason } });
      return { result: protocolFailure(reason), revision: failed.run.revision };
    }

    const started = await this.owned.startToolCall({ runId: input.run.id, execution: input.execution, expectedRevision: revision, toolCallId });
    revision = started.run.revision;
    progressActive = true;
    try {
      let result = await durableTool.execute(toJsonValue(input.toolCall.args), context, input.signal);
      assertToolExecutionResult(result);
      if (input.toolConfig.afterToolCall) result = await input.toolConfig.afterToolCall({ tool: durableTool, result, context, signal: input.signal });
      assertToolExecutionResult(result);
      result = await spillLargeToolResult(
        result,
        this.archiveDirFor(input.run.agentId),
        input.toolCall.name,
      );
      const committed = await this.owned.commitToolResult({ runId: input.run.id, execution: input.execution, expectedRevision: revision, toolCallId, state: result.ok ? "completed" : "failed", result });
      return {
        result: { toolCallId: providerToolCallId, toolName: input.toolCall.name, ...result },
        revision: committed.run.revision,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Tool execution outcome is indeterminate.";
      const indeterminate = await this.owned.commitToolResult({ runId: input.run.id, execution: input.execution, expectedRevision: revision, toolCallId, state: "indeterminate", reason, result: { ok: false, content: null, error: reason } });
      return { result: protocolFailure(reason), revision: indeterminate.run.revision };
    } finally {
      progressActive = false;
      this.transientEvents.clearTool(input.run.id, toolCallId);
    }
  }

  private async requireAgent(agentId: AgentId): Promise<AgentRecord> {
    const agent = (await this.owned.listAgents()).find((candidate) => candidate.id === agentId);
    if (!agent) throw new RuntimeError("agent_not_found", { agentId });
    return agent;
  }

  private archiveDirFor(agentId: AgentId): string | undefined {
    const store = this.owned as unknown as { contextArchiveDir?: (id: AgentId) => string };
    const archiveDir = store.contextArchiveDir?.(agentId);
    return archiveDir ? join(archiveDir, "tool-results") : undefined;
  }

  private async runConsumer(subscription: ConsumerSubscription): Promise<void> {
    const registration = await this.owned.openConsumer(subscription.consumerId);
    let cursor: EventCursor | undefined = registration.cursor;
    const waterline = cursorSequence(registration.waterline);
    let caughtUp = false;
    let pollMs = DEFAULT_POLL_MS;
    while (!subscription.controller.signal.aborted && !this.closed) {
      const events = await this.owned.listEvents(cursor ? { after: cursor } : {});
      for (const event of events) {
        if (subscription.controller.signal.aborted || this.closed) return;
        let delivered = false;
        while (!delivered && !subscription.controller.signal.aborted && !this.closed) {
          try {
            await subscription.input.onEvent(event, { signal: subscription.controller.signal });
            delivered = true;
          } catch {
            await delay(DEFAULT_POLL_MS);
          }
        }
        if (!delivered) return;
        await this.owned.advanceConsumerCheckpoint({ consumerId: subscription.consumerId, cursor: event.cursor });
        cursor = event.cursor;
        if (!caughtUp && cursorSequence(event.cursor) >= waterline) {
          caughtUp = true;
          subscription.caughtUp.resolve();
        }
      }
      if (!caughtUp && events.length === 0) {
        caughtUp = true;
        subscription.caughtUp.resolve();
      }
      pollMs = events.length === 0
        ? Math.min(MAX_CONSUMER_IDLE_POLL_MS, pollMs * 2)
        : DEFAULT_POLL_MS;
      await delay(pollMs);
    }
    if (!caughtUp) subscription.caughtUp.resolve();
  }

  async *observe(runId: RunId, options: { after?: EventCursor; signal?: AbortSignal } = {}): AsyncIterable<RunEvent> {
    let cursor = options.after;
    const subscription = this.transientEvents.subscribe(runId);
    try {
      while (true) {
        const observationVersion = subscription.checkpoint();
        const snapshot = await this.owned.snapshotRun(runId);
        const terminal = ["completed", "failed", "cancelled"].includes(snapshot.state);
        if (options.signal?.aborted && !terminal) throw abortError();
        if (terminal) {
          const pending = await this.owned.listEvents(cursor ? { after: cursor } : {});
          if (!pending.some((event) => event.runId === runId)) return;
        }
        const events = await this.owned.listEvents(cursor ? { after: cursor } : {});
        for (const event of events) {
          cursor = event.cursor;
          if (event.runId !== runId) continue;
          if (event.kind === "message_committed") {
            subscription.clearMessage(event.message.id);
          } else if (event.kind === "tool_state_changed" && ["completed", "failed", "indeterminate"].includes(event.transition.to)) {
            subscription.clearTool(event.toolCall.id);
          }
          if (event.kind === "run_state_changed" && ["completed", "failed", "cancelled"].includes(event.to)) {
            // Phase.Status and other live progress facts are transient, so
            // they are not present in the durable event list above. Drain
            // the queue before closing on the terminal durable event; this
            // preserves a final status published immediately before Run
            // completion for observers and host status bars.
            while (true) {
              const transient = subscription.shift();
              if (!transient) break;
              yield transient;
            }
            yield event;
            return;
          }
          yield event;
        }
        const transient = subscription.shift();
        if (transient) {
          yield transient;
          continue;
        }
        await Promise.race([subscription.changed(observationVersion), delay(DEFAULT_POLL_MS)]);
      }
    } finally {
      this.transientEvents.unsubscribe(runId, subscription);
    }
  }

  async wait(runId: RunId, options: { signal?: AbortSignal } = {}): Promise<RunBoundary> {
    while (true) {
      if (options.signal?.aborted) throw abortError();
      const snapshot = await this.snapshot(runId);
      if (["input_required", "completed", "failed", "cancelled"].includes(snapshot.state)) return boundaryFromSnapshot(snapshot);
      await delay(DEFAULT_POLL_MS);
    }
  }

  private assertOpen(): void {
    if (this.closed) throw new RuntimeError("runtime_closed", null);
  }

  private materializeConfig(config: AgentConfigRequest): AgentConfig {
    if (!isAgentConfiguration(config)) return config;
    return materializeConfigurationSnapshot(resolveConfigurationSnapshot(this.resources, config));
  }

  private startHeartbeat(): void {
    this.heartbeat = setInterval(() => {
      void this.owned.renewOwner(OWNER_LEASE_MS).catch(() => {
        for (const execution of this.executions.values()) execution.controller.abort();
      });
    }, OWNER_RENEWAL_MS);
    this.heartbeat.unref?.();
  }
}

class DurableRun implements AgentRun {
  constructor(private readonly runtime: AgentRuntime, readonly id: RunId) {}
  snapshot(): Promise<RunSnapshot> { return this.runtime.snapshot(this.id); }
  observe(options?: { after?: EventCursor; signal?: AbortSignal }): AsyncIterable<RunEvent> { return this.runtime.observe(this.id, options); }
  wait(options?: { signal?: AbortSignal }): Promise<RunBoundary> { return this.runtime.wait(this.id, options); }
  respond(input: { requestId: import("../runtime-events").InputRequestId; input: UserInput }): Promise<void> { return this.runtime.respond(this.id, input); }
  respondInteraction(input: { interactionId: string; input: JsonValue }): Promise<void> { return this.runtime.respondInteraction(this.id, input); }
  cancel(reason?: string): Promise<RunBoundary> { return this.runtime.cancel(this.id, reason); }
}

function promptMessage(run: RunRecord, prompt: string, sequence: number): AssistantMessage {
  return { id: createId("msg") as MessageId, agentId: run.agentId, runId: run.id, role: "assistant", content: prompt, sequenceWithinRun: sequence, createdAt: new Date().toISOString() };
}

function latestAssistant(run: RunRecord, messages: readonly AgentMessage[], sequence: number, interrupted = false): AssistantMessage | undefined {
  const message = [...messages].reverse().find((candidate) => candidate.role === "assistant");
  if (!message) return undefined;
  return projectAssistantMessage(message, run.agentId, run.id, sequence, { interrupted });
}

function hasVisibleAssistantText(message: AssistantMessage): boolean {
  return typeof message.content === "string"
    ? message.content.length > 0
    : message.content.some((part) => part.type === "text" && part.text.length > 0);
}

function durableOutcome(outcome: import("../protocol").Outcome) {
  return {
    id: outcome.id as OutcomeId,
    message: outcome.message,
    ...(outcome.payload === undefined ? {} : { payload: outcome.payload as never }),
    ...(outcome.toolResults === undefined ? {} : { toolResults: outcome.toolResults as never }),
  };
}

function boundaryFromSnapshot(snapshot: RunSnapshot): RunBoundary {
  switch (snapshot.state) {
    case "input_required": return {
      type: "input_required",
      requestId: snapshot.request.id,
      phase: snapshot.request.phase,
      prompt: snapshot.request.prompt,
      interactions: snapshot.interactions,
      answers: snapshot.answers,
    };
    case "completed": return { type: "completed", outcome: snapshot.outcome, ...(snapshot.output ? { output: snapshot.output } : {}) };
    case "failed": return { type: "failed", failure: snapshot.failure };
    case "cancelled": return { type: "cancelled", ...(snapshot.reason ? { reason: snapshot.reason } : {}) };
    default: throw new Error(`Run ${snapshot.runId} is not at a boundary.`);
  }
}

function delay(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }

function controlRunKind(run: RunRecord): string | undefined {
  const rowan = run.metadata?.rowan;
  if (typeof rowan !== "object" || rowan === null || !("kind" in rowan)) return undefined;
  const kind = (rowan as { kind?: unknown }).kind;
  return typeof kind === "string" ? kind : undefined;
}

function compactInstructions(run: RunRecord): string | undefined {
  const rowan = run.metadata?.rowan;
  if (typeof rowan !== "object" || rowan === null || !("instructions" in rowan)) return undefined;
  const instructions = (rowan as { instructions?: unknown }).instructions;
  return typeof instructions === "string" && instructions.trim().length > 0 ? instructions : undefined;
}

function compactSummary(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null || !("summary" in payload)) return undefined;
  const summary = (payload as { summary?: unknown }).summary;
  return typeof summary === "string" && summary.trim().length > 0 ? summary : undefined;
}

function compactOutputInstructions(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null || !("instructions" in payload)) return undefined;
  const instructions = (payload as { instructions?: unknown }).instructions;
  return typeof instructions === "string" && instructions.trim().length > 0
    ? instructions.trim()
    : undefined;
}

function isCompactionOutcome(payload: unknown): boolean {
  return typeof payload === "object"
    && payload !== null
    && "kind" in payload
    && (payload as { kind?: unknown }).kind === "context_compaction";
}

async function resolveContextWindowForConfig(config: AgentConfig): Promise<number> {
  if ("contextWindow" in config.model && typeof config.model.contextWindow === "number") {
    return config.model.contextWindow;
  }
  return 128_000;
}

function estimateRunInputTokens(input: UserInput): number {
  const content = typeof input === "string" ? input : input.content;
  const text = typeof content === "string"
    ? content
    : content.map((part) => part.type === "text" ? part.text : part.data).join("\n");
  return Math.ceil(text.length / 4) + 20;
}

function isContextOverflowError(error: unknown): boolean {
  const message = error instanceof Error
    ? `${error.name} ${error.message}`
    : typeof error === "string"
      ? error
      : (() => {
          try { return JSON.stringify(error); } catch { return String(error); }
        })();
  return /context(?:\s|_|-)?(?:length|window|limit|overflow|exceed)|(?:maximum|max).{0,24}tokens|too many tokens|prompt.{0,24}(?:too large|exceed|limit)/i.test(message);
}

function normalizePhaseRegistry(registry: PhaseRegistry | undefined): PhaseRegistry {
  const core = createCorePhases();
  const coreNames = new Set(core.map(({ name }) => name));
  for (const [name, phase] of registry?.phases ?? []) {
    if (coreNames.has(name) && !phase.core) {
      throw new TypeError(`Configured Phase collides with Rowan built-in Phase "${name}".`);
    }
  }
  for (const [name] of registry?.phases ?? []) {
    if (name === "continue") {
      throw new TypeError(`Configured Phase name "${name}" is reserved by Rowan routing controls.`);
    }
  }
  const authored = [...(registry?.phases ?? [])]
    .filter(([name, phase]) => !coreNames.has(name) || phase.core === false);
  return {
    phases: new Map([
      ...core.map((phase) => [phase.name, phase] as const),
      ...authored,
    ]),
    entryPhaseId: registry?.entryPhaseId ?? DEFAULT_PHASE_ID,
  };
}
function cursorSequence(cursor: EventCursor): number { return Number(String(cursor).split(":").at(-1) ?? 0); }
function abortError(): Error { const error = new Error("Operation aborted."); error.name = "AbortError"; return error; }
function toJsonValue(value: unknown): JsonValue {
  assertJsonValue(value, "tool arguments");
  return value;
}
function deferred<T = void>(): Deferred<T> {
  let resolve!: (value?: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = (value) => res(value as T | PromiseLike<T>);
    reject = rej;
  });
  return { promise, resolve, reject };
}
