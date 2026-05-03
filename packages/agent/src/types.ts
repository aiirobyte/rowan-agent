import Type from "typebox";
import type { AgentMessage, Session as CoreSession, Skill } from "@rowan-agent/session";
import type {
  AcceptanceCriterion,
  AgentBudgetUsage,
  AgentRunBudget,
  ExecutionTurn,
  LlmContext,
  LlmPhase,
  ModelCallUsage,
  ModelRef,
  ModelStreamEvent,
  Outcome,
  RuntimeDepth,
  StreamFn,
  StreamOptions,
  Task,
  TaskOutput,
  TaskRoutingDecision,
  ThreadTaskOutput,
  ToolCall,
  ToolResult,
  ToolTaskOutput,
  VerificationResult,
} from "@rowan-agent/protocol";
export { createId, Validators } from "@rowan-agent/protocol";
export type {
  AcceptanceCriterion,
  AgentBudgetUsage,
  AgentRunBudget,
  ExecutionTurn,
  ExecutionTurnEntry,
  LlmContext,
  LlmPhase,
  ModelCallUsage,
  ModelRef,
  ModelStreamEvent,
  Outcome,
  RuntimeDepth,
  StepFilter,
  StreamFn,
  StreamOptions,
  Task,
  TaskOutput,
  TaskRoutingDecision,
  ThreadTaskOutput,
  ToolCall,
  ToolResult,
  ToolTaskOutput,
  VerificationResult,
} from "@rowan-agent/protocol";

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

export const TaskRoutingDecisionSchema = Type.Object({
  route: Type.Union([
    Type.Literal("direct"),
    Type.Literal("task"),
    Type.Literal("thread"),
  ]),
  message: Type.String(),
  thread: Type.Optional(Type.Object({
    prompt: Type.String(),
    task: Type.String(),
    goal: Type.String(),
  })),
});

export const VerificationResultSchema = Type.Object({
  passed: Type.Boolean(),
  message: Type.String(),
});

export const OutcomeSchema = Type.Object({
  id: Type.String(),
  taskId: Type.Optional(Type.String()),
  passed: Type.Boolean(),
  message: Type.String(),
});

export const DEFAULT_MAX_THREAD_DEPTH = 4;

export const ToolCallSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  args: Type.Unknown(),
});

export const ToolResultSchema = Type.Object({
  toolCallId: Type.String(),
  toolName: Type.String(),
  ok: Type.Boolean(),
  content: Type.Unknown(),
  error: Type.Optional(Type.String()),
});

export type ToolContext = {
  session: CoreSession<AgentEvent>;
  task: Task;
  toolCallId: string;
  runThread?: RunThread;
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

type AgentSessionSnapshot = Omit<CoreSession<unknown>, "log" | "messages" | "createdAt" | "updatedAt">;

export type ThreadInput = {
  parentSessionId: string;
  prompt: string;
  task?: string;
  goal?: string;
  tools: Tool[];
  skills?: Skill[];
  maxAttempts?: number;
  budget?: AgentRunBudget;
  threadDepth?: number;
  verify?: boolean;
};

export type AgentThreadInput = Omit<ThreadInput, "parentSessionId"> & {
  parentSessionId?: string;
};

export type ThreadRunInput = ThreadInput & {
  systemPrompt: string;
  model: ModelRef;
  stream: StreamFn;
  signal?: AbortSignal;
  beforeToolCall?: BeforeToolCall;
  afterToolCall?: AfterToolCall;
  emit?: AgentEventListener;
};

export type ThreadRunResult = {
  parentSessionId: string;
  session: CoreSession<AgentEvent>;
  outcome: Outcome;
  budgetUsage: AgentBudgetUsage;
  threadDepth: number;
  maxThreadDepth: number;
};

export type RunThread = (input: AgentThreadInput) => Promise<ThreadRunResult>;

export type ErrorInfo = {
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
};

export type AgentEvent =
  | { type: "session_created"; session: AgentSessionSnapshot; ts: string }
  | { type: "session_loaded"; session: AgentSessionSnapshot; ts: string }
  | {
      type: "thread_created";
      parentSessionId: string;
      sessionId: string;
      prompt: string;
      task?: string;
      goal?: string;
      threadDepth?: number;
      maxThreadDepth?: number;
      ts: string;
    }
  | {
      type: "thread_end";
      parentSessionId: string;
      sessionId: string;
      outcome: Outcome;
      budgetUsage: AgentBudgetUsage;
      threadDepth?: number;
      maxThreadDepth?: number;
      ts: string;
    }
  | { type: "chat_start"; content: AgentMessage[]; ts: string }
  | { type: "message_delta"; delta: AgentMessage | AgentMessage[]; ts: string }
  | { type: "chat_end"; content: AgentMessage[]; ts: string }
  | {
      type: "model_requested";
      phase: LlmPhase;
      model: ModelRef;
      usage: ModelCallUsage;
      ts: string;
    }
  | { type: "task_created"; task: Task; ts: string }
  | { type: "task_start"; taskId: string; attempt: number; ts: string }
  | { type: "task_end"; taskId: string; attempt: number; ts: string }
  | { type: "tool_requested"; toolCall: ToolCall; ts: string }
  | { type: "tool_approval_requested"; taskId: string; toolName: string; args: unknown; ts: string }
  | {
      type: "tool_approval_result";
      taskId: string;
      toolName: string;
      args: unknown;
      decision: { allow: true } | { allow: false; reason: string };
      ts: string;
    }
  | { type: "tool_start"; toolName: string; args: unknown; ts: string }
  | { type: "tool_end"; toolName: string; result: ToolResult; ts: string }
  | { type: "tool_blocked"; toolName: string; reason: string; ts: string }
  | { type: "tool_result_review_requested"; taskId: string; toolName: string; result: ToolResult; ts: string }
  | { type: "tool_result_review_result"; taskId: string; toolName: string; result: ToolResult; ts: string }
  | { type: "verification_start"; taskId: string; ts: string }
  | { type: "verification_end"; taskId: string; result: VerificationResult; ts: string }
  | {
      type: "budget_exceeded";
      resource: keyof AgentBudgetUsage;
      limit: number;
      usage: AgentBudgetUsage;
      message: string;
      taskId?: string;
      ts: string;
    }
  | { type: "outcome"; outcome: Outcome; ts: string }
  | { type: "error"; error: ErrorInfo; ts: string };

export type AgentEventListener = ((event: AgentEvent) => void | Promise<void>) & {
  flush?: () => void | Promise<void>;
};
export type Unsubscribe = () => void;

export type AgentLoopInput = {
  session: CoreSession<AgentEvent>;
  sessionLifecycle?: "created" | "loaded" | "continued";
  model: ModelRef;
  stream: StreamFn;
  tools: Tool[];
  maxAttempts?: number;
  budget?: AgentRunBudget;
  threadDepth?: number;
  verifyTasks?: boolean;
  signal?: AbortSignal;
  beforeToolCall?: BeforeToolCall;
  afterToolCall?: AfterToolCall;
  runThread?: RunThread;
  recordStep?: (step: ExecutionTurn) => Promise<void>;
  emit?: AgentEventListener;
};

export function resolveMaxThreadDepth(budget?: AgentRunBudget): number {
  const value = budget?.maxThreadDepth ?? DEFAULT_MAX_THREAD_DEPTH;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("maxThreadDepth must be a non-negative integer.");
  }
  return value;
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
