import type { Outcome } from "../protocol";
import type {
  AgentInputRequest,
  AgentRunRecord,
  AgentRunId,
  AgentRunState,
  RuntimeEvent,
} from "./domain";
import type { RuntimeEventListener, RuntimeRunHandle } from "./agent-runtime";

export type AgentRunListener = (state: AgentRunState) => void | Promise<void>;

type AgentRunHost = {
  register(handle: RuntimeRunHandle): void;
  getRun(runId: AgentRunId): Promise<AgentRunRecord | undefined>;
  waitForRunChange(runId: AgentRunId, state: AgentRunState, updatedAt: string): Promise<void>;
  abortRun(runId: AgentRunId, reason: string): Promise<void>;
  consumeEvents(consumerId: string, listener: RuntimeEventListener): () => void;
};

const AGENT_RUN_CONSTRUCTION = Symbol("rowan.agentRun.construction");
const CREATE_AGENT_RUN = Symbol("rowan.agentRun.create");

export class AgentRun implements RuntimeRunHandle {
  private current: AgentRunRecord;
  private readonly listeners = new Set<AgentRunListener>();

  private constructor(
    token: typeof AGENT_RUN_CONSTRUCTION,
    private readonly host: AgentRunHost,
    initial: AgentRunRecord,
    private readonly publicMessageId: string,
  ) {
    if (token !== AGENT_RUN_CONSTRUCTION) {
      throw new Error("AgentRun lifecycle is owned by AgentRuntime.");
    }
    this.current = structuredClone(initial);
    host.register(this);
  }

  static [CREATE_AGENT_RUN](
    host: AgentRunHost,
    initial: AgentRunRecord,
    publicMessageId: string,
  ): AgentRun {
    return new AgentRun(AGENT_RUN_CONSTRUCTION, host, initial, publicMessageId);
  }

  get id(): AgentRunId {
    return this.current.id;
  }

  get messageId(): string {
    return this.publicMessageId;
  }

  get status(): AgentRunState {
    return this.current.state;
  }

  get state(): AgentRunState {
    return this.current.state;
  }

  get inputRequest(): AgentInputRequest | undefined {
    return this.current.inputRequest ? structuredClone(this.current.inputRequest) : undefined;
  }

  async getStatus(): Promise<AgentRunState> {
    const run = await this.host.getRun(this.id);
    if (run) this.notify(run);
    return this.current.state;
  }

  subscribe(listener: AgentRunListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  consumeRuntimeEvents(consumerId: string, listener: RuntimeEventListener): () => void {
    return this.host.consumeEvents(consumerId, (event: RuntimeEvent) => {
      if (event.runId === this.id) return listener(event);
    });
  }

  async result(): Promise<Outcome> {
    while (true) {
      const run = await this.host.getRun(this.id);
      if (!run) throw new Error(`Agent Run not found: ${this.id}.`);
      this.notify(run);
      if (["completed", "failed", "cancelled"].includes(run.state)) {
        if (!run.outcome) {
          throw new Error(`Agent Run ${this.id} reached ${run.state} without an Outcome.`);
        }
        return structuredClone(run.outcome);
      }
      await this.host.waitForRunChange(this.id, run.state, run.updatedAt);
    }
  }

  async abort(reason = "Agent Run aborted by caller."): Promise<void> {
    await this.host.abortRun(this.id, reason);
  }

  notify(run: AgentRunRecord): void {
    this.current = structuredClone(run);
    for (const listener of this.listeners) {
      try {
        const result = listener(run.state);
        if (result && typeof (result as Promise<void>).then === "function") {
          void Promise.resolve(result).catch(() => undefined);
        }
      } catch {
        // Run observers cannot change the durable Run outcome.
      }
    }
  }
}

export function createAgentRun(
  host: AgentRunHost,
  initial: AgentRunRecord,
  publicMessageId: string = initial.messageId,
): AgentRun {
  return AgentRun[CREATE_AGENT_RUN](host, initial, publicMessageId);
}
