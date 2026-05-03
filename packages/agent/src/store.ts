import Type from "typebox";
import Schema from "typebox/schema";
import {
  AgentMessageSchema,
  ContextScopeSchema,
  sessionFromPersisted,
  summarizePersistedSession,
  toPersistedSession,
  nowIso,
  type AgentMessage,
  type PersistedSession,
  type Session,
  type SessionListItem,
  type SessionStore,
} from "@rowan-agent/session";
import { ToolCallSchema, ToolResultSchema, type LlmPhase } from "./types";

const LlmPhaseSchema = Type.Union([
  Type.Literal("route"),
  Type.Literal("plan"),
  Type.Literal("execute"),
  Type.Literal("verify"),
]);

const ModelRefSchema = Type.Object({
  provider: Type.String(),
  name: Type.String(),
});

const ModelCallUsageSchema = Type.Object({
  inputMessages: Type.Number(),
  inputTokens: Type.Optional(Type.Number()),
  outputTokens: Type.Optional(Type.Number()),
  totalTokens: Type.Optional(Type.Number()),
});

const PromptStepMessageSchema = Type.Object({
  role: AgentMessageSchema.properties.role,
  content: AgentMessageSchema.properties.content,
});

export const ExecutionTurnEntrySchema = Type.Union([
  Type.Object({
    kind: Type.Literal("prompt"),
    message: PromptStepMessageSchema,
  }),
  Type.Object({
    kind: Type.Literal("assistant_text"),
    text: Type.String(),
  }),
  Type.Object({
    kind: Type.Literal("structured_output"),
    content: Type.Unknown(),
  }),
  Type.Object({
    kind: Type.Literal("tool_call"),
    toolCall: ToolCallSchema,
  }),
  Type.Object({
    kind: Type.Literal("tool_result"),
    result: ToolResultSchema,
  }),
]);

export type ExecutionTurnEntry = Type.Static<typeof ExecutionTurnEntrySchema>;

export const ExecutionTurnSchema = Type.Object({
  id: Type.String(),
  sessionId: Type.String(),
  parentSessionId: Type.Optional(Type.String()),
  phase: LlmPhaseSchema,
  requestedAtMs: Type.Number(),
  completedAtMs: Type.Number(),
  model: ModelRefSchema,
  usage: Type.Optional(ModelCallUsageSchema),
  scope: ContextScopeSchema,
  entries: Type.Array(ExecutionTurnEntrySchema),
});

export type ExecutionTurn = Type.Static<typeof ExecutionTurnSchema>;

export type StepFilter = {
  phase?: LlmPhase;
  afterMs?: number;
  scope?: ExecutionTurn["scope"];
};

export type AgentStore<TSession extends Session<unknown> = Session<unknown>> =
  SessionStore<TSession> & {
    appendStep(sessionId: string, step: ExecutionTurn): Promise<void>;
    loadSteps(sessionId: string, filter?: StepFilter): Promise<ExecutionTurn[]>;
  };

const ExecutionTurnValidator = Schema.Compile(ExecutionTurnSchema);

type StoredAgentState = {
  session: PersistedSession;
  steps: ExecutionTurn[];
};

function cloneStep(step: ExecutionTurn): ExecutionTurn {
  return ExecutionTurnValidator.Parse(JSON.parse(JSON.stringify(step)));
}

export function filterSteps(steps: readonly ExecutionTurn[], filter: StepFilter = {}): ExecutionTurn[] {
  return steps
    .filter((step) => {
      if (filter.phase && step.phase !== filter.phase) return false;
      if (filter.scope && step.scope !== filter.scope) return false;
      if (filter.afterMs !== undefined && step.requestedAtMs < filter.afterMs) return false;
      return true;
    })
    .map(cloneStep);
}

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
