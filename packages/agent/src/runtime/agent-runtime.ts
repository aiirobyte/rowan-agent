import { Agent } from "../agent";
import { createId } from "../utils";
import type { AgentResumeOptions } from "../agent";
import type {
  AgentId,
  AgentRunRecord,
  AgentRunId,
  RuntimeEvent,
  RuntimeEventCursor,
  RuntimeMessagePayload,
} from "./domain";
import type { Outcome } from "../protocol";
import type { RuntimeStateStore } from "./store";
import { ToolRuntime, type ToolRuntimePolicy } from "./tool-runtime";

export type RuntimeSessionManagerProvider = {
  create(input: import("../harness/session/session-manager").CreateSessionManagerInput): Promise<import("../harness/session/session-manager").SessionManager>;
  open(sessionId: string): Promise<import("../harness/session/session-manager").SessionManager | undefined>;
};

export type AgentFactoryIdentity = {
  agentId: AgentId;
  sessionId: string;
  factoryId: import("./domain").FactoryId;
};

export type AgentFactory = (
  identity: AgentFactoryIdentity,
) => Promise<Omit<AgentResumeOptions, "sessionId"> | undefined> | Omit<AgentResumeOptions, "sessionId"> | undefined;

export type AgentRuntimeOptions = {
  stateStore: RuntimeStateStore;
  sessionManager?: RuntimeSessionManagerProvider;
  factories?: ReadonlyMap<import("./domain").FactoryId, AgentFactory> | Readonly<Record<string, AgentFactory>>;
  toolPolicy?: ToolRuntimePolicy;
  maxConcurrentRuns?: number;
};

export type RuntimeRunControl = {
  suspend(reason?: string): Promise<void>;
};

type LiveAgent = {
  abort?: (reason?: string) => void;
  execute?: (payload: RuntimeMessagePayload, runId: AgentRunId, control: RuntimeRunControl) => Promise<Outcome>;
};

export type RuntimeRunHandle = {
  notify(run: AgentRunRecord): void;
};

export type RuntimeRunExecutor = (
  payload: RuntimeMessagePayload,
  control?: RuntimeRunControl,
) => Promise<Outcome>;

export type RuntimeEventListener = (event: RuntimeEvent) => void | Promise<void>;

export const bindAgentSymbol = Symbol("rowan.agentRuntime.bindAgent");
export const unbindAgentSymbol = Symbol("rowan.agentRuntime.unbindAgent");
export const registerRunHandleSymbol = Symbol("rowan.agentRuntime.registerRunHandle");
export const waitForRunSymbol = Symbol("rowan.agentRuntime.waitForRun");
export const scheduleRunSymbol = Symbol("rowan.agentRuntime.scheduleRun");
export const abortRunSymbol = Symbol("rowan.agentRuntime.abortRun");

let activeRuntime: AgentRuntime | undefined;

type PendingJob = {
  agentId: AgentId;
  runId: AgentRunId;
  executor?: RuntimeRunExecutor;
};

type EventSubscription = {
  listener: RuntimeEventListener;
  after?: import("./domain").RuntimeEventId;
};

export class AgentRuntime {
  readonly stateStore: RuntimeStateStore;
  readonly sessionManager?: RuntimeSessionManagerProvider;
  readonly maxConcurrentRuns: number;
  readonly toolRuntime: ToolRuntime;
  private readonly factories: ReadonlyMap<string, AgentFactory>;
  private readonly bindings = new Map<AgentId, LiveAgent>();
  private readonly runHandles = new Map<AgentRunId, RuntimeRunHandle>();
  private readonly runWaiters = new Map<AgentRunId, Set<() => void>>();
  private readonly pendingRuns: PendingJob[] = [];
  private readonly scheduledRunIds = new Set<AgentRunId>();
  private readonly runningAgents = new Set<AgentId>();
  private readonly eventSubscriptions = new Set<EventSubscription>();
  private readonly activeDispatches = new Set<Promise<void>>();
  private runningRuns = 0;
  private pumping = false;
  private nextWorkerId = 0;
  private stopped = false;

  private constructor(options: AgentRuntimeOptions) {
    this.stateStore = options.stateStore;
    this.sessionManager = options.sessionManager;
    this.maxConcurrentRuns = options.maxConcurrentRuns ?? Number.POSITIVE_INFINITY;
    this.toolRuntime = new ToolRuntime(options.stateStore, options.toolPolicy);
    this.factories = options.factories instanceof Map
      ? new Map([...options.factories.entries()].map(([id, factory]) => [String(id), factory]))
      : new Map(Object.entries(options.factories ?? {}));
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
    const runtime = new AgentRuntime(options);
    activeRuntime = runtime;
    await runtime.recover();
    return runtime;
  }

  static current(): AgentRuntime | undefined {
    return activeRuntime;
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    for (const binding of this.bindings.values()) {
      binding.abort?.("Agent Runtime stopped.");
    }
    this.bindings.clear();
    this.pendingRuns.length = 0;
    this.scheduledRunIds.clear();
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

  [bindAgentSymbol](agentId: AgentId, agent: LiveAgent): void {
    this.assertRunning();
    if (this.bindings.has(agentId)) {
      throw new Error(`Agent ${agentId} is already bound to a live Agent.`);
    }
    this.bindings.set(agentId, agent);
    void this.scheduleQueuedRuns(agentId);
  }

  [unbindAgentSymbol](agentId: AgentId, agent: LiveAgent): void {
    if (this.bindings.get(agentId) === agent) this.bindings.delete(agentId);
  }

  [registerRunHandleSymbol](runId: AgentRunId, handle: RuntimeRunHandle): void {
    this.runHandles.set(runId, handle);
  }

  [waitForRunSymbol](runId: AgentRunId): Promise<void> {
    return new Promise((resolve) => {
      const waiters = this.runWaiters.get(runId) ?? new Set<() => void>();
      waiters.add(resolve);
      this.runWaiters.set(runId, waiters);
    });
  }

  [scheduleRunSymbol](agentId: AgentId, runId: AgentRunId, executor?: RuntimeRunExecutor): void {
    this.assertRunning();
    if (this.scheduledRunIds.has(runId)) return;
    this.scheduledRunIds.add(runId);
    this.pendingRuns.push({ agentId, runId, executor });
    void this.pump();
  }

  async pauseAgent(agentId: AgentId): Promise<void> {
    this.assertRunning();
    await this.stateStore.setAgentState(agentId, "paused");
    await this.publishEvents();
  }

  async pause(agentId: AgentId): Promise<void> {
    return this.pauseAgent(agentId);
  }

  async resumeAgent(agentId: AgentId): Promise<void> {
    this.assertRunning();
    await this.stateStore.setAgentState(agentId, "active");
    await this.scheduleQueuedRuns(agentId);
    await this.publishEvents();
  }

  async resume(agentId: AgentId): Promise<void> {
    return this.resumeAgent(agentId);
  }

  async abortRun(runId: AgentRunId, reason = "Agent Run aborted by caller."): Promise<void> {
    await this[abortRunSymbol](runId, reason);
  }

  async [abortRunSymbol](runId: AgentRunId, reason: string): Promise<void> {
    const run = await this.stateStore.getRun(runId);
    if (!run || ["completed", "failed", "cancelled"].includes(run.state)) return;
    const aborted = await this.stateStore.abortRun({
      runId,
      outcome: { id: createId("out"), message: reason },
    });
    this.notifyRun(aborted);
    this.toolRuntime.abortRun(runId);
    this.bindings.get(aborted.agentId)?.abort?.(reason);
    await this.publishEvents();
  }

  subscribeEvents(listener: RuntimeEventListener, cursor: RuntimeEventCursor = {}): () => void {
    const subscription: EventSubscription = { listener, ...(cursor.after ? { after: cursor.after } : {}) };
    this.eventSubscriptions.add(subscription);
    void this.deliverEvents(subscription);
    return () => this.eventSubscriptions.delete(subscription);
  }

  async listEvents(cursor?: RuntimeEventCursor): Promise<RuntimeEvent[]> {
    return this.stateStore.listEvents(cursor);
  }

  private async recover(): Promise<void> {
    await this.stateStore.recoverExpiredLeases(new Date(Date.now() + 24 * 60 * 60 * 1000));
    const agents = await this.stateStore.listAgents();
    for (const record of agents) {
      if (record.state !== "active" || !record.factoryId) continue;
      const factory = this.factories.get(String(record.factoryId));
      if (!factory) {
        await this.stateStore.recordEvent({ kind: "factory_missing", related: { agentId: record.id }, payload: { factoryId: record.factoryId } });
        continue;
      }
      try {
        const options = await factory({ agentId: record.id, sessionId: record.sessionId, factoryId: record.factoryId });
        if (!options) continue;
        await Agent.resume({ ...options, sessionId: record.sessionId });
        await this.stateStore.recordEvent({ kind: "agent_recovered", related: { agentId: record.id }, payload: { factoryId: record.factoryId } });
      } catch (error) {
        await this.stateStore.recordEvent({ kind: "factory_missing", related: { agentId: record.id }, payload: { factoryId: record.factoryId, error: error instanceof Error ? error.message : String(error) } });
      }
    }
    for (const record of await this.stateStore.listAgents()) {
      if (this.bindings.has(record.id)) await this.scheduleQueuedRuns(record.id);
    }
    await this.publishEvents();
  }

  private async scheduleQueuedRuns(agentId: AgentId): Promise<void> {
    if (!this.bindings.has(agentId)) return;
    const runs = await this.stateStore.listRuns({ agentId, states: ["queued"] });
    for (const run of runs) this[scheduleRunSymbol](agentId, run.id);
  }

  private async pump(): Promise<void> {
    if (this.pumping || this.stopped) return;
    this.pumping = true;
    try {
      while (this.runningRuns < this.maxConcurrentRuns) {
        const index = this.pendingRuns.findIndex((job) => this.bindings.has(job.agentId) && !this.runningAgents.has(job.agentId));
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
    const control: RuntimeRunControl = {
      suspend: async (reason) => {
        if (suspended) return;
        suspended = true;
        const current = await this.stateStore.suspendRun({ runId: job.runId, reason });
        this.notifyRun(current);
        await this.publishEvents();
        suspendedResolve?.();
      },
    };
    try {
      const leased = await this.stateStore.leaseRun({
        runId: job.runId,
        workerId,
        leaseDurationMs: 60_000,
      });
      this.notifyRun(leased.run);
      const execute = job.executor ?? binding.execute;
      if (!execute) throw new Error(`Agent ${job.agentId} has no Runtime executor.`);
      const execution = job.executor
        ? job.executor(leased.message.payload, control)
        : binding.execute!(leased.message.payload, job.runId, control);
      const outcome = await Promise.race([
        execution.then((value) => ({ kind: "terminal" as const, value })).catch((error) => ({ kind: "error" as const, error })),
        suspendedSignal.then(() => ({ kind: "suspended" as const })),
      ]);
      if (outcome.kind === "suspended") {
        void execution.catch(() => undefined);
        return;
      }
      if (outcome.kind === "error") {
        await this.finishFailedRun(job.runId, outcome.error);
        return;
      }
      await this.finishRun(job, leased.message.id, outcome.value);
    } catch (error) {
      const current = await this.stateStore.getRun(job.runId);
      if (!current || ["completed", "failed", "cancelled", "suspended"].includes(current.state)) {
        if (current) this.notifyRun(current);
        return;
      }
      await this.finishFailedRun(job.runId, error);
    }
  }

  private async finishRun(job: PendingJob, messageId: import("./domain").RuntimeMessageId, outcome: Outcome): Promise<void> {
    const current = await this.stateStore.getRun(job.runId);
    if (!current || ["completed", "failed", "cancelled"].includes(current.state)) {
      if (current) this.notifyRun(current);
      return;
    }
    const completed = await this.stateStore.completeRun({ runId: current.id, outcome });
    await this.stateStore.acknowledgeMessage(messageId);
    this.notifyRun(completed);
    await this.publishEvents();
  }

  private async finishFailedRun(runId: AgentRunId, error: unknown): Promise<void> {
    const current = await this.stateStore.getRun(runId);
    if (!current || ["completed", "failed", "cancelled"].includes(current.state)) {
      if (current) this.notifyRun(current);
      return;
    }
    const failed = await this.stateStore.completeRun({
      runId,
      state: "failed",
      outcome: { id: createId("out"), message: error instanceof Error ? error.message : "Agent Run failed." },
    });
    const message = await this.stateStore.getMessage(failed.messageId);
    if (message && ["queued", "leased"].includes(message.state)) await this.stateStore.acknowledgeMessage(message.id);
    this.notifyRun(failed);
    await this.publishEvents();
  }

  private notifyRun(run: AgentRunRecord): void {
    this.runHandles.get(run.id)?.notify(run);
    const waiters = this.runWaiters.get(run.id);
    if (!waiters) return;
    this.runWaiters.delete(run.id);
    for (const resolve of waiters) resolve();
  }

  private async publishEvents(): Promise<void> {
    await Promise.all([...this.eventSubscriptions].map((subscription) => this.deliverEvents(subscription)));
  }

  private async deliverEvents(subscription: EventSubscription): Promise<void> {
    const events = await this.stateStore.listEvents(subscription.after ? { after: subscription.after } : undefined);
    for (const event of events) {
      subscription.after = event.id;
      await subscription.listener(structuredClone(event));
    }
  }

  private assertRunning(): void {
    if (this.stopped || activeRuntime !== this) throw new Error("Agent Runtime is stopped.");
  }
}
