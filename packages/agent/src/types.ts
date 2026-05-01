import Type from "typebox";
import Schema from "typebox/schema";

export type ModelRef = {
  provider: string;
  name: string;
};

export type LlmPhase = "plan" | "execute" | "verify";

export type ModelCallUsage = {
  inputMessages: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type ModelTraceMessage = Pick<AgentMessage, "role" | "content"> & {
  metadata?: Record<string, unknown>;
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

export type SessionSnapshot = Omit<Session, "log" | "messages" | "createdAt" | "updatedAt">;

export type ModelStreamEvent =
  | { type: "trace_messages"; messages: ModelTraceMessage[] }
  | { type: "text_delta"; text: string }
  | {
      type: "model_call";
      phase: LlmPhase;
      model: ModelRef;
      usage: ModelCallUsage;
    }
  | { type: "tool_call"; toolCall: ToolCall }
  | { type: "structured_output"; content: unknown }
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
  | { type: "session_created"; session: SessionSnapshot; ts: string }
  | { type: "session_start"; sessionId: string; ts: string }
  | { type: "session_end"; sessionId: string; ts: string }
  | { type: "message_start"; content: AgentMessage[]; ts: string }
  | { type: "message_delta"; delta: AgentMessage | AgentMessage[]; content: AgentMessage[]; ts: string }
  | { type: "message_end"; content: AgentMessage[]; ts: string }
  | {
      type: "model_call";
      phase: LlmPhase;
      model: ModelRef;
      usage: ModelCallUsage;
      ts: string;
    }
  | { type: "task_created"; task: Task; ts: string }
  | { type: "task_attempt_start"; taskId: string; attempt: number; ts: string }
  | { type: "task_attempt_end"; taskId: string; attempt: number; ts: string }
  | { type: "tool_call_requested"; toolCall: ToolCall; ts: string }
  | { type: "tool_call_approval_requested"; taskId: string; toolName: string; args: unknown; ts: string }
  | {
      type: "tool_call_approval_result";
      taskId: string;
      toolName: string;
      args: unknown;
      decision: { allow: true } | { allow: false; reason: string };
      ts: string;
    }
  | { type: "tool_call_start"; toolName: string; args: unknown; ts: string }
  | { type: "tool_call_end"; toolName: string; result: ToolResult; ts: string }
  | { type: "tool_call_blocked"; toolName: string; reason: string; ts: string }
  | { type: "tool_result_review_requested"; taskId: string; toolName: string; result: ToolResult; ts: string }
  | { type: "tool_result_review_result"; taskId: string; toolName: string; result: ToolResult; ts: string }
  | { type: "verification_start"; taskId: string; ts: string }
  | { type: "verification_end"; taskId: string; result: VerificationResult; ts: string }
  | { type: "outcome"; outcome: Outcome; ts: string }
  | { type: "error"; error: ErrorInfo; ts: string };

export type AgentEventListener = ((event: AgentEvent) => void | Promise<void>) & {
  flush?: () => void | Promise<void>;
};
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

function padDatePart(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

export function formatLocalTimestamp(date = new Date()): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const offsetSign = offsetMinutes >= 0 ? "+" : "-";
  const offsetAbsolute = Math.abs(offsetMinutes);
  const offsetHours = Math.floor(offsetAbsolute / 60);
  const offsetRemainingMinutes = offsetAbsolute % 60;

  return [
    `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`,
    "T",
    `${padDatePart(date.getHours())}${padDatePart(date.getMinutes())}${padDatePart(date.getSeconds())}`,
    "-",
    padDatePart(Math.floor(date.getMilliseconds() / 10)),
    offsetSign,
    padDatePart(offsetHours),
    ":",
    padDatePart(offsetRemainingMinutes),
  ].join("");
}

export function nowIso(): string {
  return formatLocalTimestamp();
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
