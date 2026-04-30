import Type from "typebox";
import Schema from "typebox/schema";

export type ModelRef = {
  provider: string;
  name: string;
};

export const AgentMessageSchema = Type.Object({
  id: Type.String(),
  role: Type.Union([
    Type.Literal("system"),
    Type.Literal("user"),
    Type.Literal("assistant"),
    Type.Literal("tool"),
  ]),
  content: Type.String(),
  createdAt: Type.String(),
  metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});

export type AgentMessage = Type.Static<typeof AgentMessageSchema>;

export const SkillSchema = Type.Object({
  id: Type.String(),
  path: Type.String(),
  content: Type.String(),
  toolNames: Type.Optional(Type.Array(Type.String())),
});

export type Skill = Type.Static<typeof SkillSchema>;

export const AcceptanceCriterionSchema = Type.Union([
  Type.Object({
    id: Type.String(),
    type: Type.Literal("model_judge"),
    description: Type.String(),
    required: Type.Boolean(),
  }),
  Type.Object({
    id: Type.String(),
    type: Type.Literal("tool_observation"),
    description: Type.String(),
    toolName: Type.Optional(Type.String()),
    required: Type.Boolean(),
  }),
]);

export type AcceptanceCriterion = Type.Static<typeof AcceptanceCriterionSchema>;

export const TaskSchema = Type.Object({
  id: Type.String(),
  title: Type.String(),
  instruction: Type.String(),
  acceptanceCriteria: Type.Array(AcceptanceCriterionSchema),
  toolNames: Type.Array(Type.String()),
  skillIds: Type.Array(Type.String()),
  status: Type.Union([
    Type.Literal("pending"),
    Type.Literal("running"),
    Type.Literal("passed"),
    Type.Literal("failed"),
  ]),
  attempts: Type.Number(),
});

export type Task = Type.Static<typeof TaskSchema>;

export const EvidenceSchema = Type.Object({
  id: Type.String(),
  kind: Type.String(),
  summary: Type.String(),
  data: Type.Optional(Type.Unknown()),
});

export type Evidence = Type.Static<typeof EvidenceSchema>;

export const VerificationResultSchema = Type.Object({
  passed: Type.Boolean(),
  message: Type.String(),
  evidence: Type.Array(EvidenceSchema),
  failedCriteria: Type.Array(Type.String()),
});

export type VerificationResult = Type.Static<typeof VerificationResultSchema>;

export const OutcomeSchema = Type.Object({
  id: Type.String(),
  taskId: Type.String(),
  passed: Type.Boolean(),
  message: Type.String(),
  evidence: Type.Array(EvidenceSchema),
  failedCriteria: Type.Array(Type.String()),
});

export type Outcome = Type.Static<typeof OutcomeSchema>;

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

export type ToolContext = {
  session: Session;
  task: Task;
  toolCallId: string;
};

export type Tool<TArgs = unknown> = {
  name: string;
  description: string;
  parameters: Type.TSchema;
  execute(args: TArgs, context: ToolContext, signal?: AbortSignal): Promise<ToolResult>;
};

export type BeforeToolCall = (input: {
  task: Task;
  tool: Tool;
  args: unknown;
}) => Promise<{ allow: true } | { allow: false; reason: string }>;

export type AfterToolCall = (input: {
  task: Task;
  tool: Tool;
  result: ToolResult;
}) => Promise<ToolResult>;

export type Session = {
  id: string;
  systemPrompt: string;
  userInput: string;
  messages: AgentMessage[];
  log: AgentEvent[];
  skills: Skill[];
  createdAt: string;
  updatedAt: string;
};

export type ModelStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_call"; toolCall: ToolCall }
  | { type: "structured_output"; value: unknown }
  | { type: "done" };

export type LlmContext =
  | {
      phase: "plan";
      session: Session;
    }
  | {
      phase: "execute";
      session: Session;
      task: Task;
      toolResults: ToolResult[];
    }
  | {
      phase: "verify";
      session: Session;
      task: Task;
      toolResults: ToolResult[];
      criteria: AcceptanceCriterion[];
    };

export type StreamOptions = {
  signal?: AbortSignal;
};

export type StreamFn = (
  model: ModelRef,
  context: LlmContext,
  options: StreamOptions,
) => AsyncIterable<ModelStreamEvent>;

export type ErrorInfo = {
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
};

export type AgentEvent =
  | { type: "session_start"; sessionId: string; timestamp: string }
  | { type: "session_end"; sessionId: string; timestamp: string }
  | { type: "message_start"; messageId: string; timestamp: string }
  | { type: "message_delta"; messageId: string; text: string; timestamp: string }
  | { type: "message_end"; message: AgentMessage; timestamp: string }
  | { type: "task_created"; task: Task; timestamp: string }
  | { type: "task_attempt_start"; taskId: string; attempt: number; timestamp: string }
  | { type: "task_attempt_end"; taskId: string; attempt: number; timestamp: string }
  | { type: "tool_call_start"; toolName: string; args: unknown; timestamp: string }
  | { type: "tool_call_end"; toolName: string; result: ToolResult; timestamp: string }
  | { type: "tool_call_blocked"; toolName: string; reason: string; timestamp: string }
  | { type: "verification_start"; taskId: string; timestamp: string }
  | { type: "verification_end"; taskId: string; result: VerificationResult; timestamp: string }
  | { type: "outcome"; outcome: Outcome; timestamp: string }
  | { type: "error"; error: ErrorInfo; timestamp: string };

export type AgentEventListener = (event: AgentEvent) => void | Promise<void>;
export type Unsubscribe = () => void;

export type AgentLoopInput = {
  session: Session;
  model: ModelRef;
  stream: StreamFn;
  tools: Tool[];
  maxAttempts?: number;
  signal?: AbortSignal;
  beforeToolCall?: BeforeToolCall;
  afterToolCall?: AfterToolCall;
  emit?: AgentEventListener;
};

export const Validators = {
  task: Schema.Compile(TaskSchema),
  toolCall: Schema.Compile(ToolCallSchema),
  toolResult: Schema.Compile(ToolResultSchema),
  verificationResult: Schema.Compile(VerificationResultSchema),
  outcome: Schema.Compile(OutcomeSchema),
};

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function createMessage(
  role: AgentMessage["role"],
  content: string,
  metadata?: Record<string, unknown>,
): AgentMessage {
  return {
    id: createId("msg"),
    role,
    content,
    createdAt: nowIso(),
    ...(metadata ? { metadata } : {}),
  };
}

export function createSession(input: {
  systemPrompt: string;
  userInput: string;
  skills?: Skill[];
}): Session {
  const createdAt = nowIso();
  const messages = [
    createMessage("system", input.systemPrompt),
    ...(input.skills?.length
      ? [
          createMessage(
            "system",
            `Loaded skills:\n\n${input.skills
              .map((skill) => `# ${skill.id}\n${skill.content}`)
              .join("\n\n")}`,
            { kind: "skills" },
          ),
        ]
      : []),
    createMessage("user", input.userInput),
  ];

  return {
    id: createId("ses"),
    systemPrompt: input.systemPrompt,
    userInput: input.userInput,
    messages,
    log: [],
    skills: input.skills ?? [],
    createdAt,
    updatedAt: createdAt,
  };
}
