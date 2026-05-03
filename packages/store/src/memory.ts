import {
  nowIso,
  sessionFromPersisted,
  summarizePersistedSession,
  toPersistedSession,
  type PersistedSession,
  type Session,
  type SessionListItem,
} from "@rowan-agent/session";
import {
  ExecutionTurnValidator,
  cloneStep,
  filterSteps,
  type AgentStore,
  type ExecutionTurn,
  type StepFilter,
} from "./types";

type StoredAgentState = {
  session: PersistedSession;
  steps: ExecutionTurn[];
};

export class InMemoryAgentStore<TSession extends Session<unknown> = Session<unknown>>
  implements AgentStore<TSession>
{
  private readonly states = new Map<string, StoredAgentState>();

  async create(session: TSession): Promise<TSession> {
    if (this.states.has(session.id)) {
      throw new Error(`Session already exists: ${session.id}`);
    }

    const persisted = toPersistedSession(session);
    this.states.set(session.id, { session: persisted, steps: [] });
    return sessionFromPersisted(persisted) as TSession;
  }

  async load(id: string): Promise<TSession | undefined> {
    const state = this.states.get(id);
    return state ? (sessionFromPersisted(state.session) as TSession) : undefined;
  }

  async save(session: TSession): Promise<void> {
    const existing = this.states.get(session.id);
    this.states.set(session.id, {
      session: toPersistedSession(session),
      steps: existing?.steps.map(cloneStep) ?? [],
    });
  }

  async list(): Promise<SessionListItem[]> {
    return [...this.states.values()]
      .map((state) => summarizePersistedSession(state.session))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async delete(id: string): Promise<boolean> {
    return this.states.delete(id);
  }

  async appendStep(sessionId: string, step: ExecutionTurn): Promise<void> {
    const state = this.states.get(sessionId);
    if (!state) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const normalized = ExecutionTurnValidator.Parse({
      ...step,
      sessionId,
    });
    state.steps.push(cloneStep(normalized));
    state.session.updatedAt = nowIso();
  }

  async loadSteps(sessionId: string, filter?: StepFilter): Promise<ExecutionTurn[]> {
    const state = this.states.get(sessionId);
    return state ? filterSteps(state.steps, filter) : [];
  }
}
