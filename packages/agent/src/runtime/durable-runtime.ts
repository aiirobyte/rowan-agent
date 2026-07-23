import { createModelStream } from "@rowan-agent/models";
import type { AgentMessage, ModelRef } from "../protocol";
import type { StreamFn } from "@rowan-agent/models";
import { createId } from "../utils";
import { executeOnce } from "./execution";
import { ConfigCommandService } from "./config-commands";
import type {
  AgentConfig,
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
  RunRecord,
  RunSnapshot,
  RunState,
  RunSummary,
  Tool as DurableTool,
  UserInput,
} from "./contracts";
import { assertToolExecutionResult } from "./contracts";
import type { AgentId, AssistantMessage, JsonValue, MessageId, OutcomeId, RunId, RunFailure, ToolCallId } from "../runtime-events";
import { RuntimeError } from "./errors";
import { pageAgents, pageRuns } from "./read-models";
import { projectAssistantMessage, projectModelContext } from "./model-context";
import { assembleExtensions } from "./extensions";
import { InMemoryConfigProvider } from "./config-provider";
import { createDefaultPhase, DEFAULT_PHASE_ID } from "../harness/phases/default";
import type { AgentRuntimePort } from "../loop/types";
import type { ToolCall, ToolResult } from "../protocol";
import { assertJsonValue } from "./json";

const DEFAULT_CONCURRENCY = 10;
const DEFAULT_POLL_MS = 25;
const OWNER_LEASE_MS = 30_000;
const OWNER_RENEWAL_MS = 10_000;

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

export class AgentRuntime implements AgentRuntimeContract {
  private readonly concurrency: number;
  private readonly owned: import("./contracts").OwnedStore;
  private readonly commands: ConfigCommandService;
  private readonly storeIncarnation: string;
  private readonly activeAgents = new Set<AgentId>();
  private readonly executions = new Map<RunId, AbortController>();
  private readonly consumers = new Map<string, ConsumerSubscription>();
  private heartbeat?: ReturnType<typeof setInterval>;
  private pumping = false;
  private closed = false;

  private constructor(options: AgentRuntimeOptions & { configs: import("./contracts").ConfigProvider }, owned: import("./contracts").OwnedStore) {
    this.owned = owned;
    this.commands = new ConfigCommandService(owned, options.configs, String(owned.lease.token).split(":")[0]!);
    this.storeIncarnation = String(owned.lease.token).split(":")[0]!;
    this.concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  }

  static async init(options: AgentRuntimeOptions): Promise<AgentRuntime> {
    if (!options.store) throw new TypeError("AgentRuntime requires a DurableStore");
    const configs = options.configs ?? new InMemoryConfigProvider();
    const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
    if (!Number.isInteger(concurrency) || concurrency <= 0) throw new TypeError("concurrency must be a positive integer");
    const owned = await options.store.openOwner({ ownerId: createId("owner"), leaseMs: OWNER_LEASE_MS });
    const runtime = new AgentRuntime({ ...options, configs, concurrency }, owned);
    runtime.startHeartbeat();
    void runtime.pump();
    return runtime;
  }

  async createAgent(config: AgentConfig, options: { idempotencyKey?: string; metadata?: import("../runtime-events").Metadata } = {}): Promise<AgentId> {
    this.assertOpen();
    return this.commands.createAgent({
      config,
      ...(options.metadata === undefined ? {} : { metadata: options.metadata }),
      idempotencyKey: options.idempotencyKey ?? crypto.randomUUID(),
    });
  }

  async updateAgentConfig(agentId: AgentId, config: AgentConfig, options: { idempotencyKey: string }): Promise<void> {
    this.assertOpen();
    await this.commands.updateAgentConfig({ agentId, config, idempotencyKey: options.idempotencyKey });
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
    for (const controller of this.executions.values()) controller.abort();
    this.executions.clear();
    for (const subscription of this.consumers.values()) subscription.controller.abort();
    await this.owned.sealAndReleaseOwner();
  }

  async snapshot(runId: RunId): Promise<RunSnapshot> {
    this.assertOpen();
    return this.owned.snapshotRun(runId);
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

  async cancel(runId: RunId, reason?: string): Promise<RunBoundary> {
    this.assertOpen();
    const snapshot = await this.owned.snapshotRun(runId);
      await this.owned.cancelRun({ runId, expectedRevision: snapshot.revision, ...(reason === undefined ? {} : { reason }) });
    this.executions.get(runId)?.abort();
    return boundaryFromSnapshot(await this.owned.snapshotRun(runId));
  }

  private async pump(): Promise<void> {
    if (this.pumping || this.closed) return;
    this.pumping = true;
    try {
      while (!this.closed && this.executions.size < this.concurrency) {
        const queued = await this.owned.listRuns({ states: ["queued"] });
        const next = queued.find((run) => !this.activeAgents.has(run.agentId));
        if (!next) return;
        this.activeAgents.add(next.agentId);
        const task = this.execute(next).finally(() => {
          this.activeAgents.delete(next.agentId);
          this.executions.delete(next.id);
          void this.pump();
        });
        void task;
      }
    } finally {
      this.pumping = false;
    }
  }

  private async execute(run: RunRecord): Promise<void> {
    let claim: import("./contracts").RunClaim | undefined;
    let executionRevision = run.revision;
    try {
      const agent = await this.requireAgent(run.agentId);
      const token = run.pinnedConfigToken ?? agent.currentConfigToken;
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
      const executionId = createId("exec") as import("../runtime-events").ExecutionId;
      claim = await this.owned.claimRun({ runId: run.id, expectedRevision: run.revision, executionId, configToken: token });
      const controller = new AbortController();
      this.executions.set(run.id, controller);
      const config = resolution.config;
      const assembly = await assembleExtensions(config);
      const executionConfig: AgentConfig = {
        ...config,
        context: assembly.context,
        ...(assembly.beforeToolCall ? { beforeToolCall: assembly.beforeToolCall } : {}),
        ...(assembly.afterToolCall ? { afterToolCall: assembly.afterToolCall } : {}),
      };
      executionRevision = claim.run.revision;
      let toolQueue = Promise.resolve();
      const model = "stream" in config && config.stream
        ? config.model as ModelRef
        : { provider: config.model.provider, id: config.model.id } satisfies ModelRef;
      const stream = "stream" in config && config.stream ? config.stream as StreamFn : createModelStream(config.model as never);
      const executionContext = projectModelContext({
        context: {
          ...executionConfig.context,
          phases: executionConfig.context.phases ?? {
            phases: new Map([[DEFAULT_PHASE_ID, createDefaultPhase()]]),
            entryPhaseId: DEFAULT_PHASE_ID,
          },
        },
        messages: claim.history,
        agentId: run.agentId,
        runId: run.id,
      });
      const result = await executeOnce({
        canonicalMessages: executionContext.messages,
        context: executionContext,
        model,
        stream,
        maxAttempts: executionConfig.maxAttempts,
        checkpoint: claim.run.checkpoint,
        signal: controller.signal,
        beforePhase: assembly.beforePhase,
        afterPhase: assembly.afterPhase,
        beforePrompt: assembly.beforePrompt,
        onContext: assembly.setContext,
        runtime: {
          tools: ({ toolCall }: { config: import("../loop/types").AgentConfig; toolCall: ToolCall }) => {
            const task = toolQueue.then(async () => {
              const execution = await this.executeTool({
                run,
                execution: claim!.execution,
                expectedRevision: executionRevision,
                config: executionConfig,
                toolCall,
                signal: controller.signal,
              });
              executionRevision = execution.revision;
              return execution.result;
            });
            toolQueue = task.then(() => undefined, () => undefined);
            return task;
          },
        } satisfies AgentRuntimePort,
      });
      if (result.type === "input_required") {
        const prompt = promptMessage(run, result.request.prompt, result.messages.length);
        await this.owned.commitInputRequired({ runId: run.id, execution: claim.execution, expectedRevision: executionRevision, requestId: createId("input") as import("../runtime-events").InputRequestId, prompt, checkpoint: result.checkpoint });
        return;
      }
      if (result.type === "completed") {
        const output = latestAssistant(run, result.messages, claim.history.length);
        await this.owned.commitOutcome({ runId: run.id, execution: claim.execution, expectedRevision: executionRevision, outcome: durableOutcome(result.outcome), ...(output ? { output } : {}) });
        return;
      }
      const failure: RunFailure = { code: "execution_failed", message: result.error instanceof Error ? result.error.message : "Execution failed." };
      await this.owned.commitOutcome({ runId: run.id, execution: claim.execution, expectedRevision: executionRevision, failure });
    } catch (error) {
      if (!claim && error instanceof RuntimeError && ["run_state_conflict", "runtime_ownership_lost", "run_not_found"].includes(error.code)) return;
      if (claim) {
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

  private async executeTool(input: {
    run: RunRecord;
    execution: import("./contracts").ExecutionToken;
    expectedRevision: number;
    config: AgentConfig;
    toolCall: ToolCall;
    signal: AbortSignal;
  }): Promise<{ result: ToolResult; revision: number }> {
    const tool = input.config.context.tools.find((candidate) => candidate.name === input.toolCall.name) as DurableTool | undefined;
    const providerToolCallId = input.toolCall.id;
    const toolCallId = createId("tool") as ToolCallId;
    const requestMessageId = createId("msg") as MessageId;
    const reserved = await this.owned.reserveToolCall({
      runId: input.run.id,
      execution: input.execution,
      expectedRevision: input.expectedRevision,
      requestMessageId,
      toolCallId,
      name: input.toolCall.name,
      args: toJsonValue(input.toolCall.args),
    });
    let revision = reserved.run.revision;
    const protocolFailure = (error: string): ToolResult => ({ toolCallId: providerToolCallId, toolName: input.toolCall.name, ok: false, content: null, error });
    if (!tool) {
      const failed = await this.owned.commitToolResult({ runId: input.run.id, execution: input.execution, expectedRevision: revision, toolCallId, state: "failed", result: { ok: false, content: null, error: `Tool ${input.toolCall.name} is not available.` } });
      return { result: protocolFailure(`Tool ${input.toolCall.name} is not available.`), revision: failed.run.revision };
    }

    const context = { agentId: input.run.agentId, runId: input.run.id, toolCallId } as const;
    try {
      if (input.config.beforeToolCall) {
        const decision = await input.config.beforeToolCall({ tool, args: toJsonValue(input.toolCall.args), context, signal: input.signal });
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
    try {
      let result = await tool.execute(toJsonValue(input.toolCall.args), context, input.signal);
      assertToolExecutionResult(result);
      if (input.config.afterToolCall) result = await input.config.afterToolCall({ tool, result, context, signal: input.signal });
      assertToolExecutionResult(result);
      const committed = await this.owned.commitToolResult({ runId: input.run.id, execution: input.execution, expectedRevision: revision, toolCallId, state: result.ok ? "completed" : "failed", result });
      return {
        result: { toolCallId: providerToolCallId, toolName: input.toolCall.name, ...result },
        revision: committed.run.revision,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Tool execution outcome is indeterminate.";
      const indeterminate = await this.owned.commitToolResult({ runId: input.run.id, execution: input.execution, expectedRevision: revision, toolCallId, state: "indeterminate", reason, result: { ok: false, content: null, error: reason } });
      return { result: protocolFailure(reason), revision: indeterminate.run.revision };
    }
  }

  private async requireAgent(agentId: AgentId): Promise<AgentRecord> {
    const agent = (await this.owned.listAgents()).find((candidate) => candidate.id === agentId);
    if (!agent) throw new RuntimeError("agent_not_found", { agentId });
    return agent;
  }

  private async runConsumer(subscription: ConsumerSubscription): Promise<void> {
    const registration = await this.owned.openConsumer(subscription.consumerId);
    let cursor: EventCursor | undefined = registration.cursor;
    const waterline = cursorSequence(registration.waterline);
    let caughtUp = false;
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
      await delay(DEFAULT_POLL_MS);
    }
    if (!caughtUp) subscription.caughtUp.resolve();
  }

  async *observe(runId: RunId, options: { after?: EventCursor; signal?: AbortSignal } = {}): AsyncIterable<DurableRunEvent> {
    let cursor = options.after;
    while (true) {
      if (options.signal?.aborted) throw abortError();
      const snapshot = await this.owned.snapshotRun(runId);
      if (["completed", "failed", "cancelled"].includes(snapshot.state)) {
        const pending = await this.owned.listEvents(cursor ? { after: cursor } : {});
        if (!pending.some((event) => event.runId === runId)) return;
      }
      const events = await this.owned.listEvents(cursor ? { after: cursor } : {});
      let terminal = false;
      for (const event of events) {
        cursor = event.cursor;
        if (event.runId !== runId) continue;
        yield event;
        if (event.kind === "run_transitioned" && ["completed", "failed", "cancelled"].includes(event.to)) terminal = true;
      }
      if (terminal) return;
      await delay(DEFAULT_POLL_MS);
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

  private startHeartbeat(): void {
    this.heartbeat = setInterval(() => {
      void this.owned.renewOwner(OWNER_LEASE_MS).catch(() => {
        for (const controller of this.executions.values()) controller.abort();
      });
    }, OWNER_RENEWAL_MS);
    this.heartbeat.unref?.();
  }
}

class DurableRun implements AgentRun {
  constructor(private readonly runtime: AgentRuntime, readonly id: RunId) {}
  snapshot(): Promise<RunSnapshot> { return this.runtime.snapshot(this.id); }
  observe(options?: { after?: EventCursor; signal?: AbortSignal }): AsyncIterable<DurableRunEvent> { return this.runtime.observe(this.id, options); }
  wait(options?: { signal?: AbortSignal }): Promise<RunBoundary> { return this.runtime.wait(this.id, options); }
  respond(input: { requestId: import("../runtime-events").InputRequestId; input: UserInput }): Promise<void> { return this.runtime.respond(this.id, input); }
  cancel(reason?: string): Promise<RunBoundary> { return this.runtime.cancel(this.id, reason); }
}

function promptMessage(run: RunRecord, prompt: string, sequence: number): AssistantMessage {
  return { id: createId("msg") as MessageId, agentId: run.agentId, runId: run.id, role: "assistant", content: prompt, sequenceWithinRun: sequence, createdAt: new Date().toISOString() };
}

function latestAssistant(run: RunRecord, messages: readonly AgentMessage[], sequence: number): AssistantMessage | undefined {
  const message = [...messages].reverse().find((candidate) => candidate.role === "assistant");
  if (!message) return undefined;
  return projectAssistantMessage(message, run.agentId, run.id, sequence);
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
    case "input_required": return { type: "input_required", requestId: snapshot.request.id, prompt: snapshot.request.prompt };
    case "completed": return { type: "completed", outcome: snapshot.outcome, ...(snapshot.output ? { output: snapshot.output } : {}) };
    case "failed": return { type: "failed", failure: snapshot.failure };
    case "cancelled": return { type: "cancelled", ...(snapshot.reason ? { reason: snapshot.reason } : {}) };
    default: throw new Error(`Run ${snapshot.runId} is not at a boundary.`);
  }
}

function delay(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
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
