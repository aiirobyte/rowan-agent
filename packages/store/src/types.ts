import Type from "typebox";
import Schema from "typebox/schema";
import {
  AgentMessageSchema,
  ContextScopeSchema,
  type AgentMessage,
  type Session,
  type SessionStore,
} from "@rowan-agent/session";

export const LlmPhaseSchema = Type.Union([
  Type.Literal("route"),
  Type.Literal("plan"),
  Type.Literal("execute"),
  Type.Literal("verify"),
]);

export type LlmPhase = Type.Static<typeof LlmPhaseSchema>;

export const ModelRefSchema = Type.Object({
  provider: Type.String(),
  name: Type.String(),
});

export type ModelRef = Type.Static<typeof ModelRefSchema>;

export const ModelCallUsageSchema = Type.Object({
  inputMessages: Type.Number(),
  inputTokens: Type.Optional(Type.Number()),
  outputTokens: Type.Optional(Type.Number()),
  totalTokens: Type.Optional(Type.Number()),
});

export type ModelCallUsage = Type.Static<typeof ModelCallUsageSchema>;

export const ToolCallSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  args: Type.Unknown(),
});

export type ToolCall = Type.Static<typeof ToolCallSchema>;

export const ToolResultSchema = Type.Object({
  toolCallId: Type.String(),
  toolName: Type.String(),
  ok: Type.Boolean(),
  content: Type.Unknown(),
  error: Type.Optional(Type.String()),
});

export type ToolResult = Type.Static<typeof ToolResultSchema>;

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

export const ExecutionTurnValidator = Schema.Compile(ExecutionTurnSchema);

export function cloneStep(step: ExecutionTurn): ExecutionTurn {
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

export type PromptStepMessage = Pick<AgentMessage, "role" | "content">;
