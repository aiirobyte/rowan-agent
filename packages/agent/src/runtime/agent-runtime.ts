import { Agent, attachAgent } from "../agent";
import type { AgentRunControl, AttachedAgentBinding } from "../agent";
import { createId } from "../utils";
import type { AgentOptions } from "../agent";
import { createModelStream } from "@rowan-agent/models";
import type { ModelConfig } from "@rowan-agent/models";
import type {
  AgentId,
  AgentRunRecord,
  AgentRunId,
  RuntimeEvent,
  RuntimeEventCursor,
} from "./domain";
import type { AgentMessage, Outcome } from "../protocol";
import type { SessionManagerProvider } from "../harness/session/session-manager";
import type { RuntimeStateStore } from "./store";
import { ToolRuntime, type ToolRuntimePolicy } from "./tool-runtime";
import { createAgentRun } from "./agent-run";

export type AgentRuntimeOptions = {
  stateStore: RuntimeStateStore;
  sessionProvider?: SessionManagerProvider;
  toolPolicy?: ToolRuntimePolicy;
  maxConcurrentRuns?: number;
  maxInfrastructureAttempts?: number;
  leaseDurationMs?: number;
  leaseRenewalIntervalMs?: number;
};

class InfrastructureFailureError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "InfrastructureFailureError";
  }
}

export type RuntimeRunHandle = {
  notify(run: AgentRunRecord): void;
};

export type RuntimeEventDisposition = {
  type: "enqueue";
  agentId: AgentId;
  input: AgentMessage;
};

export type RuntimeEventListener = (
  event: RuntimeEvent,
) => RuntimeEventDisposition | void | Promise<RuntimeEventDisposition | void>;

let activeRuntime: AgentRuntime | undefined;

type PendingJob = {
  agentId: AgentId;
  runId: AgentRunId;
};

type EventSubscription = {
  consumerId: string;
  listener: RuntimeEventListener;
  delivering: boolean;
  redeliver: boolean;
};

export class AgentRuntime {
  private readonly stateStore: RuntimeStateStore;
  private readonly sessionProvider?: SessionManagerProvider;
  private readonly maxConcurrentRuns: number;
  private readonly maxInfrastructureAttempts: number;
  private readonly leaseDurationMs: number;
  private readonly leaseRenewalIntervalMs: number;
  private readonly toolRuntime: ToolRuntime;
  private readonly bindings = new Map<AgentId, AttachedAgentBinding>();
  private readonly runHandles = new Map<AgentRunId, RuntimeRunHandle>();
  private readonly runWaiters = new Map<AgentRunId, Set<() => void>>();
  private readonly pendingRuns: PendingJob[] = [];
  private readonly scheduledRunIds = new Set<AgentRunId>();
  private readonly runningAgents = new Set<AgentId>();
  private readonly pausedAgents = new Set<AgentId>();
  private readonly eventSubscriptions = new Map<string, EventSubscription>();
  private readonly activeDispatches = new Set<Promise<void>>();
  private runningRuns = 0;
  private pumping = false;
  private nextWorkerId = 0;
  private stopped = false;

  private constructor(options: AgentRuntimeOptions) {
    this.stateStore = options.stateStore;
    this.sessionProvider = options.sessionProvider;
    this.maxConcurrentRuns = options.maxConcurrentRuns ?? Number.POSITIVE_INFINITY;
    this.maxInfrastructureAttempts = options.maxInfrastructureAttempts ?? 3;
    this.leaseDurationMs = options.leaseDurationMs ?? 60_000;
    this.leaseRenewalIntervalMs = options.leaseRenewalIntervalMs ?? Math.max(1, Math.floor(this.leaseDurationMs / 2));
    this.toolRuntime = new ToolRuntime(options.stateStore, options.toolPolicy, () => this.publishEvents());
  }

  static async start(options: AgentRuntimeOptions): Promise<AgentRuntime> {
    if (activeRuntime) {
      throw new Error("Agent Runtime is already started in this process.");
    }
    if (!options.stateStore) {
      throw new Error("Agent Runtime requires a RuntimeStateStore.");
    }
    if (!Number.isFinite(options.maxConcurrentRuns ?? 1) || (options.maxConcurrentRuns ?? 1) <= 0) {
      throw new Error("Agent Runtime maxConcurrentRuns must be a positive finite number.");
    }
    if (!Number.isInteger(options.maxInfrastructureAttempts ?? 3) || (options.maxInfrastructureAttempts ?? 3) <= 0) {
      throw new Error("Agent Runtime maxInfrastructureAttempts must be a positive integer.");
    }
    if (!Number.isFinite(options.leaseDurationMs ?? 60_000) || (options.leaseDurationMs ?? 60_000) <= 0) {
      throw new Error("Agent Runtime leaseDurationMs must be a positive finite number.");
    }
    const leaseDurationMs = options.leaseDurationMs ?? 60_000;
    const renewalIntervalMs = options.leaseRenewalIntervalMs ?? Math.max(1, Math.floor(leaseDurationMs / 2));
    if (!Number.isFinite(renewalIntervalMs) || renewalIntervalMs <= 0 || renewalIntervalMs >= leaseDurationMs) {
      throw new Error("Agent Runtime leaseRenewalIntervalMs must be positive and shorter than leaseDurationMs.");
    }
    const runtime = new AgentRuntime(options);
    activeRuntime = runtime;
    try {
      await runtime.recover();
      return runtime;
    } catch (error) {
      await runtime.stop().catch(() => undefined);
      throw error;
    }
  }

  async createAgent(options: AgentOptions): Promise<Agent> {
    this.assertRunning();
    assertAgentOptions(options);
    const provider = this.sessionProvider;
    if (!provider) throw new Error("Agent Runtime requires a SessionManager provider to create an Agent.");
    const manager = await provider.create({
      systemPrompt: options.context.systemPrompt,
      input: "",
      skills: options.context.skills,
    });
    const record = await this.stateStore.createAgent({
      sessionId: manager.getSessionId(),
    });
    this.pausedAgents.delete(record.id);
    const agent = await this.attachAgent(record, manager, options);
    this.publishEvents();
    return agent;
  }

  async reconstructAgent(
    agentId: AgentId,
    options: AgentOptions,
  ): Promise<Agent> {
    this.assertRunning();
    assertAgentOptions(options);
    const record = await this.stateStore.getAgent(agentId);
    if (!record) throw new Error(`Agent not found: ${agentId}.`);
    if (record.state === "paused") this.pausedAgents.add(record.id);
    else this.pausedAgents.delete(record.id);
    const provider = this.sessionProvider;
    if (!provider) throw new Error("Agent Runtime requires a SessionManager provider to reconstruct an Agent.");
    const manager = await provider.open(record.sessionId);
    if (!manager) throw new Error(`Session not found: ${record.sessionId}.`);
    const agent = await this.attachAgent(record, manager, options);
    this.publishEvents();
    return agent;
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    const suspendedAgents = new Set(
      (await this.stateStore.listRuns({ states: ["suspended"] })).map((run) => run.agentId),
    );
    for (const [agentId, binding] of this.bindings) {
      if (!suspendedAgents.has(agentId) && !binding.isSuspended()) binding.abort("Agent Runtime stopped.");
    }
    this.bindings.clear();
    this.pendingRuns.length = 0;
    this.scheduledRunIds.clear();
    this.pausedAgents.clear();
    const activeDispatches = [...this.activeDispatches];
    this.runHandles.clear();
    for (const waiters of this.runWaiters.values()) {
      for (const resolve of waiters) resolve();
    }
    this.runWaiters.clear();
    this.eventSubscriptions.clear();
    await Promise.allSettled(activeDispatches);
    if (activeRuntime === this) activeRuntime = undefined;
  }

  private bindAgent(agentId: AgentId, agent: AttachedAgentBinding): void {
    this.assertRunning();
    if (this.bindings.has(agentId)) {
      throw new Error(`Agent ${agentId} is already bound to a live Agent.`);
    }
    this.bindings.set(agentId, agent);
    void this.pump();
    if (!this.pausedAgents.has(agentId)) void this.scheduleQueuedRuns(agentId);
  }

  private registerRunHandle(runId: AgentRunId, handle: RuntimeRunHandle): void {
    this.runHandles.set(runId, handle);
  }

  private waitForRunChange(runId: AgentRunId, state: AgentRunRecord["state"], updatedAt: string): Promise<void> {
    return new Promise((resolve) => {
      const waiters = this.runWaiters.get(runId) ?? new Set<() => void>();
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        waiters.delete(finish);
        if (waiters.size === 0) this.runWaiters.delete(runId);
        resolve();
      };
      waiters.add(finish);
      this.runWaiters.set(runId, waiters);
      void this.stateStore.getRun(runId).then((current) => {
        if (!current || current.state !== state || current.updatedAt !== updatedAt) finish();
      }, finish);
    });
  }

  private scheduleRun(agentId: AgentId, runId: AgentRunId): void {
    this.assertRunning();
    if (this.scheduledRunIds.has(runId)) return;
    this.scheduledRunIds.add(runId);
    this.pendingRuns.push({ agentId, runId });
    void this.pump();
  }

  async pauseAgent(agentId: AgentId): Promise<void> {
    this.assertRunning();
    this.pausedAgents.add(agentId);
    try {
      await this.stateStore.setAgentState(agentId, "paused");
    } catch (error) {
      this.pausedAgents.delete(agentId);
      throw error;
    }
    this.publishEvents();
  }

  async resumeAgent(agentId: AgentId): Promise<void> {
    this.assertRunning();
    await this.stateStore.setAgentState(agentId, "active");
    this.pausedAgents.delete(agentId);
    await this.scheduleQueuedRuns(agentId);
    void this.pump();
    this.publishEvents();
  }

  async getRun(runId: AgentRunId): Promise<AgentRunRecord | undefined> {
    return this.stateStore.getRun(runId);
  }

  async abortRun(runId: AgentRunId, reason = "Agent Run aborted by caller."): Promise<void> {
    const run = await this.stateStore.getRun(runId);
    if (!run || ["completed", "failed", "cancelled"].includes(run.state)) return;
    const aborted = await this.stateStore.abortRun({
      runId,
      outcome: { id: createId("out"), message: reason },
    });
    this.notifyRun(aborted);
    if (run.state === "queued") {
      const pendingIndex = this.pendingRuns.findIndex((job) => job.runId === runId);
      if (pendingIndex >= 0) this.pendingRuns.splice(pendingIndex, 1);
      this.scheduledRunIds.delete(runId);
    }
    this.toolRuntime.abortRun(runId);
    if (run.state === "running" || run.state === "suspended") {
      this.bindings.get(aborted.agentId)?.abort(reason);
    }
    this.publishEvents();
  }

  consumeEvents(consumerId: string, listener: RuntimeEventListener): () => void {
    this.assertRunning();
    if (consumerId.trim().length === 0) {
      throw new Error("Runtime Event Consumer ID must not be empty.");
    }
    if (this.eventSubscriptions.has(consumerId)) {
      throw new Error(`Runtime Event Consumer is already active: ${consumerId}.`);
    }
    const subscription: EventSubscription = {
      consumerId,
      listener,
      delivering: false,
      redeliver: false,
    };
    this.eventSubscriptions.set(consumerId, subscription);
    void this.deliverEvents(subscription).catch(() => undefined);
    return () => {
      if (this.eventSubscriptions.get(consumerId) === subscription) {
        this.eventSubscriptions.delete(consumerId);
      }
    };
  }

  async listEvents(cursor?: RuntimeEventCursor): Promise<RuntimeEvent[]> {
    return this.stateStore.listEvents(cursor);
  }

  private async recover(): Promise<void> {
    await this.stateStore.recoverLeases();
    const agents = await this.stateStore.listAgents();
    for (const record of agents) {
      if (record.state === "paused") this.pausedAgents.add(record.id);
    }
    this.publishEvents();
  }

  private async scheduleQueuedRuns(agentId: AgentId): Promise<void> {
    if (!this.bindings.has(agentId)) return;
    const runs = await this.stateStore.listRuns({ agentId, states: ["queued"] });
    for (const run of runs) this.scheduleRun(agentId, run.id);
  }

  private async attachAgent(
    record: import("./domain").AgentRecord,
    manager: import("../harness/session/session-manager").SessionManager,
    options: AgentOptions,
  ): Promise<Agent> {
    const model = { provider: options.model.provider, id: options.model.id };
    const resolvedOptions = {
      ...options,
      model,
      stream: options.stream ?? createModelStream(options.model),
    };
    const attached = await attachAgent({
      options: resolvedOptions,
      agentId: record.id,
      sessionId: record.sessionId,
      manager,
      submit: (message, persist) => this.submitAgentInput(record.id, message, persist),
      executeTool: (input) => this.toolRuntime.execute(input),
    });
    this.bindAgent(record.id, attached.binding);
    return attached.agent;
  }

  private async submitAgentInput(
    agentId: AgentId,
    input: import("../types").AgentMessage,
    persist: () => Promise<void>,
  ): Promise<import("./agent-run").AgentRun> {
    this.assertRunning();
    if (!this.bindings.has(agentId)) throw new Error(`Agent ${agentId} has no live Agent Binding.`);
    const enqueued = await this.stateStore.enqueueAgentInput({ agentId, input });
    await persist();
    const run = createAgentRun({
      register: (handle) => this.registerRunHandle(enqueued.run.id, handle),
      getRun: (runId) => this.stateStore.getRun(runId),
      waitForRunChange: (runId, state, updatedAt) => this.waitForRunChange(runId, state, updatedAt),
      abortRun: (runId, reason) => this.abortRun(runId, reason),
      consumeEvents: (consumerId, listener) => this.consumeEvents(consumerId, listener),
    }, enqueued.run, input.id);
    this.scheduleRun(agentId, enqueued.run.id);
    this.publishEvents();
    return run;
  }

  private async pump(): Promise<void> {
    if (this.pumping || this.stopped) return;
    this.pumping = true;
    try {
      while (this.runningRuns < this.maxConcurrentRuns) {
        const index = this.pendingRuns.findIndex((job) => (
          this.bindings.has(job.agentId)
          && !this.pausedAgents.has(job.agentId)
          && !this.runningAgents.has(job.agentId)
        ));
        if (index < 0) return;
        const [job] = this.pendingRuns.splice(index, 1);
        if (!job) return;
        this.runningRuns += 1;
        this.runningAgents.add(job.agentId);
        let dispatch!: Promise<void>;
        dispatch = this.dispatchRun(job).finally(() => {
          this.runningRuns -= 1;
          this.runningAgents.delete(job.agentId);
          this.scheduledRunIds.delete(job.runId);
          this.activeDispatches.delete(dispatch);
          void this.pump();
        });
        this.activeDispatches.add(dispatch);
        void dispatch;
      }
    } finally {
      this.pumping = false;
    }
  }

  private async dispatchRun(job: PendingJob): Promise<void> {
    const binding = this.bindings.get(job.agentId);
    if (!binding) return;
    const workerId = `runtime-worker-${++this.nextWorkerId}`;
    let suspendedResolve: (() => void) | undefined;
    let suspended = false;
    const suspendedSignal = new Promise<void>((resolve) => { suspendedResolve = resolve; });
    const control: AgentRunControl = {
      suspend: async (reason, executionState) => {
        if (suspended) return;
        suspended = true;
        const current = await this.stateStore.suspendRun({ runId: job.runId, reason, executionState });
        this.notifyRun(current);
        this.publishEvents();
        suspendedResolve?.();
      },
    };
    let renewalTimer: ReturnType<typeof setInterval> | undefined;
    let renewalFailed = false;
    let failRenewal!: (error: InfrastructureFailureError) => void;
    const renewalFailureSignal = new Promise<InfrastructureFailureError>((resolve) => {
      failRenewal = resolve;
    });
    try {
      const leased = await this.stateStore.leaseRun({
        runId: job.runId,
        workerId,
        leaseDurationMs: this.leaseDurationMs,
      });
      this.notifyRun(leased.run);
      try {
        await binding.persistInput(leased.message.input);
      } catch (error) {
        throw new InfrastructureFailureError("Agent Input persistence failed.", { cause: error });
      }
      renewalTimer = setInterval(() => {
        void this.stateStore.renewLease({
          runId: job.runId,
          leaseId: leased.lease.id,
          leaseDurationMs: this.leaseDurationMs,
        }).catch((error) => {
          if (renewalFailed) return;
          renewalFailed = true;
          const failure = new InfrastructureFailureError("Agent Run Lease renewal failed.", { cause: error });
          binding.abort(failure.message);
          failRenewal(failure);
        });
      }, this.leaseRenewalIntervalMs);
      const execution = binding.execute(leased.message.input, job.runId, control, leased.run.executionState);
      const outcome = await Promise.race([
        execution.then((value) => ({ kind: "terminal" as const, value })).catch((error) => ({ kind: "error" as const, error })),
        suspendedSignal.then(() => ({ kind: "suspended" as const })),
        renewalFailureSignal.then((error) => ({ kind: "renewal_failure" as const, error })),
      ]);
      if (outcome.kind === "suspended") {
        void execution.catch(() => undefined);
        return;
      }
      if (outcome.kind === "error") {
        await this.finishFailedRun(job, outcome.error);
        return;
      }
      if (outcome.kind === "renewal_failure") {
        await execution.catch(() => undefined);
        await this.finishFailedRun(job, outcome.error);
        return;
      }
      await this.finishRun(job, outcome.value);
    } catch (error) {
      const current = await this.stateStore.getRun(job.runId);
      if (!current || ["completed", "failed", "cancelled", "suspended"].includes(current.state)) {
        if (current) this.notifyRun(current);
        return;
      }
      if (current.state !== "running") {
        this.notifyRun(current);
        return;
      }
      await this.finishFailedRun(job, error);
    } finally {
      if (renewalTimer) clearInterval(renewalTimer);
    }
  }

  private async finishRun(job: PendingJob, outcome: Outcome): Promise<void> {
    const current = await this.stateStore.getRun(job.runId);
    if (!current || ["completed", "failed", "cancelled"].includes(current.state)) {
      if (current) this.notifyRun(current);
      return;
    }
    const completed = await this.stateStore.completeRun({ runId: current.id, outcome });
    this.notifyRun(completed);
    this.publishEvents();
  }

  private async finishFailedRun(job: PendingJob, error: unknown): Promise<void> {
    const current = await this.stateStore.getRun(job.runId);
    if (!current || ["completed", "failed", "cancelled"].includes(current.state)) {
      if (current) this.notifyRun(current);
      return;
    }
    const message = error instanceof Error ? error.message : "Agent Run failed.";
    const outcome = { id: createId("out"), message };
    const retryable = isRetryableInfrastructureError(error);
    if (retryable && current.attempt < this.maxInfrastructureAttempts) {
      const retried = await this.stateStore.retryRun({ runId: current.id, reason: message });
      this.notifyRun(retried);
      this.pendingRuns.push(job);
      this.publishEvents();
      return;
    }
    const failed = retryable
      ? await this.stateStore.exhaustRun({ runId: current.id, outcome, reason: message })
      : await this.stateStore.completeRun({ runId: current.id, state: "failed", outcome });
    this.notifyRun(failed);
    this.publishEvents();
  }

  private notifyRun(run: AgentRunRecord): void {
    this.runHandles.get(run.id)?.notify(run);
    const waiters = this.runWaiters.get(run.id);
    if (!waiters) return;
    this.runWaiters.delete(run.id);
    for (const resolve of waiters) resolve();
  }

  private publishEvents(): void {
    for (const subscription of this.eventSubscriptions.values()) {
      void this.deliverEvents(subscription).catch(() => undefined);
    }
  }

  private async deliverEvents(subscription: EventSubscription): Promise<void> {
    if (subscription.delivering) {
      subscription.redeliver = true;
      return;
    }
    subscription.delivering = true;
    try {
      do {
        subscription.redeliver = false;
        const checkpoint = await this.stateStore.getEventCheckpoint(subscription.consumerId);
        const events = await this.stateStore.listEvents(
          checkpoint.eventId ? { after: checkpoint.eventId } : undefined,
        );
        for (const event of events) {
          if (this.eventSubscriptions.get(subscription.consumerId) !== subscription) return;
          const disposition = await subscription.listener(structuredClone(event));
          if (disposition?.type === "enqueue") {
            const delivered = await this.stateStore.acknowledgeEventAndEnqueueAgentInput({
              consumerId: subscription.consumerId,
              eventId: event.id,
              agentId: disposition.agentId,
              input: disposition.input,
            });
            if (delivered.enqueued) {
              this.scheduleRun(delivered.enqueued.run.agentId, delivered.enqueued.run.id);
              this.publishEvents();
            }
          } else {
            await this.stateStore.acknowledgeEvent(subscription.consumerId, event.id);
          }
        }
      } while (subscription.redeliver);
    } finally {
      subscription.delivering = false;
    }
  }

  private assertRunning(): void {
    if (this.stopped || activeRuntime !== this) throw new Error("Agent Runtime is stopped.");
  }
}

function isModelConfig(value: unknown): value is ModelConfig {
  if (typeof value !== "object" || value === null) return false;
  return "protocol" in value && "baseUrl" in value && "apiKey" in value;
}

function assertAgentOptions(options: AgentOptions): void {
  if (options.stream && isModelConfig(options.model)) {
    throw new Error("AgentOptions accepts either a complete model config or a custom stream, not both.");
  }
}

function isRetryableInfrastructureError(error: unknown): boolean {
  if (error instanceof InfrastructureFailureError) return true;
  return typeof error === "object"
    && error !== null
    && "retryable" in error
    && error.retryable === true;
}
