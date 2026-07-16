import type { AgentId, AgentRunRecord, AgentRunId, RuntimeMessagePayload } from "./domain";
import { createId } from "../utils";
import type { Outcome } from "../protocol";
import type { RuntimeStateStore } from "./store";
import type {
  CreateSessionManagerInput,
  SessionManager,
} from "../harness/session/session-manager";

export type RuntimeSessionManagerProvider = {
  create(input: CreateSessionManagerInput): Promise<SessionManager>;
  open(sessionId: string): Promise<SessionManager | undefined>;
};

export type AgentRuntimeOptions = {
  stateStore: RuntimeStateStore;
  sessionManager?: RuntimeSessionManagerProvider;
  maxConcurrentRuns?: number;
};

type LiveAgent = {
  abort?: (reason?: string) => void;
};

export type RuntimeRunHandle = {
  notify(run: AgentRunRecord): void;
};

export type RuntimeRunExecutor = (payload: RuntimeMessagePayload) => Promise<Outcome>;

export const bindAgentSymbol = Symbol("rowan.agentRuntime.bindAgent");
export const unbindAgentSymbol = Symbol("rowan.agentRuntime.unbindAgent");
export const registerRunHandleSymbol = Symbol("rowan.agentRuntime.registerRunHandle");
export const waitForRunSymbol = Symbol("rowan.agentRuntime.waitForRun");
export const scheduleRunSymbol = Symbol("rowan.agentRuntime.scheduleRun");
export const abortRunSymbol = Symbol("rowan.agentRuntime.abortRun");

let activeRuntime: AgentRuntime | undefined;

export class AgentRuntime {
  readonly stateStore: RuntimeStateStore;
  readonly sessionManager?: RuntimeSessionManagerProvider;
  readonly maxConcurrentRuns: number;
  private readonly bindings = new Map<AgentId, LiveAgent>();
  private readonly runHandles = new Map<AgentRunId, RuntimeRunHandle>();
  private readonly runWaiters = new Map<AgentRunId, Set<() => void>>();
  private readonly pendingRuns: Array<{
    agentId: AgentId;
    runId: AgentRunId;
    executor: RuntimeRunExecutor;
  }> = [];
  private readonly runningAgents = new Set<AgentId>();
  private runningRuns = 0;
  private pumping = false;
  private nextWorkerId = 0;
  private stopped = false;

  private constructor(options: AgentRuntimeOptions) {
    this.stateStore = options.stateStore;
    this.sessionManager = options.sessionManager;
    this.maxConcurrentRuns = options.maxConcurrentRuns ?? Number.POSITIVE_INFINITY;
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
    return runtime;
  }

  static current(): AgentRuntime | undefined {
    return activeRuntime;
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.bindings.clear();
    this.pendingRuns.length = 0;
    this.runHandles.clear();
    for (const waiters of this.runWaiters.values()) {
      for (const resolve of waiters) resolve();
    }
    this.runWaiters.clear();
    if (activeRuntime === this) {
      activeRuntime = undefined;
    }
  }

  [bindAgentSymbol](agentId: AgentId, agent: LiveAgent): void {
    this.assertRunning();
    if (this.bindings.has(agentId)) {
      throw new Error(`Agent ${agentId} is already bound to a live Agent.`);
    }
    this.bindings.set(agentId, agent);
  }

  [unbindAgentSymbol](agentId: AgentId, agent: LiveAgent): void {
    if (this.bindings.get(agentId) === agent) {
      this.bindings.delete(agentId);
    }
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

  [scheduleRunSymbol](agentId: AgentId, runId: AgentRunId, executor: RuntimeRunExecutor): void {
    this.pendingRuns.push({ agentId, runId, executor });
    void this.pump();
  }

  async [abortRunSymbol](runId: AgentRunId, reason: string): Promise<void> {
    const run = await this.stateStore.getRun(runId);
    if (!run || ["completed", "failed", "cancelled"].includes(run.state)) return;
    const aborted = await this.stateStore.abortRun({
      runId,
      outcome: { id: createId("out"), message: reason },
    });
    this.notifyRun(aborted);
    this.bindings.get(aborted.agentId)?.abort?.(reason);
  }

  private async pump(): Promise<void> {
    if (this.pumping || this.stopped) return;
    this.pumping = true;
    try {
      while (this.runningRuns < this.maxConcurrentRuns) {
        const index = this.pendingRuns.findIndex((job) => !this.runningAgents.has(job.agentId));
        if (index < 0) return;
        const [job] = this.pendingRuns.splice(index, 1);
        if (!job) return;
        this.runningRuns += 1;
        this.runningAgents.add(job.agentId);
        void this.dispatchRun(job).finally(() => {
          this.runningRuns -= 1;
          this.runningAgents.delete(job.agentId);
          void this.pump();
        });
      }
    } finally {
      this.pumping = false;
    }
  }

  private async dispatchRun(job: {
    agentId: AgentId;
    runId: AgentRunId;
    executor: RuntimeRunExecutor;
  }): Promise<void> {
    const { agentId, runId, executor } = job;
    const workerId = `runtime-worker-${++this.nextWorkerId}`;
    try {
      const leased = await this.stateStore.leaseRun({
        runId,
        workerId,
        leaseDurationMs: 60_000,
      });
      this.notifyRun(leased.run);
      const outcome = await executor(leased.message.payload);
      const completed = await this.stateStore.completeRun({ runId, outcome });
      await this.stateStore.acknowledgeMessage(leased.message.id);
      this.notifyRun(completed);
    } catch (error) {
      const current = await this.stateStore.getRun(runId);
      if (current?.state === "queued" && error instanceof Error && error.message.includes("already has an active Run")) {
        this.pendingRuns.push(job);
        return;
      }
      if (!current || ["completed", "failed", "cancelled"].includes(current.state)) {
        if (current) this.notifyRun(current);
        return;
      }
      const failed = await this.stateStore.completeRun({
        runId,
        state: "failed",
        outcome: {
          id: createId("out"),
          message: error instanceof Error ? error.message : "Agent Run failed.",
        },
      });
      await this.stateStore.acknowledgeMessage((await this.stateStore.getRun(runId))!.messageId);
      this.notifyRun(failed);
    }
  }

  private notifyRun(run: AgentRunRecord): void {
    this.runHandles.get(run.id)?.notify(run);
    const waiters = this.runWaiters.get(run.id);
    if (!waiters) return;
    this.runWaiters.delete(run.id);
    for (const resolve of waiters) resolve();
  }

  private assertRunning(): void {
    if (this.stopped || activeRuntime !== this) {
      throw new Error("Agent Runtime is stopped.");
    }
  }
}
