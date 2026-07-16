import type { Outcome } from "../protocol";
import type { AgentRunRecord, AgentRunId, AgentRunState } from "./domain";
import {
  abortRunSymbol,
  type AgentRuntime,
  registerRunHandleSymbol,
  waitForRunSymbol,
} from "./agent-runtime";

export type AgentRunListener = (run: AgentRunRecord) => void | Promise<void>;

export class AgentRun {
  private current: AgentRunRecord;
  private readonly listeners = new Set<AgentRunListener>();

  constructor(
    private readonly runtime: AgentRuntime,
    initial: AgentRunRecord,
  ) {
    this.current = structuredClone(initial);
    runtime[registerRunHandleSymbol](initial.id, this);
  }

  get id(): AgentRunId {
    return this.current.id;
  }

  get status(): AgentRunState {
    return this.current.state;
  }

  get state(): AgentRunState {
    return this.current.state;
  }

  async getStatus(): Promise<AgentRunState> {
    const run = await this.runtime.stateStore.getRun(this.id);
    if (run) this.notify(run);
    return this.current.state;
  }

  subscribe(listener: AgentRunListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async result(): Promise<Outcome> {
    while (true) {
      const run = await this.runtime.stateStore.getRun(this.id);
      if (!run) {
        throw new Error(`Agent Run not found: ${this.id}.`);
      }
      this.notify(run);
      if (["completed", "failed", "cancelled"].includes(run.state)) {
        if (!run.outcome) {
          throw new Error(`Agent Run ${this.id} reached ${run.state} without an Outcome.`);
        }
        return structuredClone(run.outcome);
      }
      await this.runtime[waitForRunSymbol](this.id);
    }
  }

  async abort(reason = "Agent Run aborted by caller."): Promise<void> {
    await this.runtime[abortRunSymbol](this.id, reason);
  }

  notify(run: AgentRunRecord): void {
    this.current = structuredClone(run);
    for (const listener of this.listeners) {
      try {
        const result = listener(structuredClone(run));
        if (result && typeof (result as Promise<void>).then === "function") {
          void Promise.resolve(result).catch(() => undefined);
        }
      } catch {
        // Run observers cannot change the durable Run outcome.
      }
    }
  }
}
