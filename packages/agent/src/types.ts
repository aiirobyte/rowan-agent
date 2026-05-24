import Type from "typebox";
import { createId, Validators } from "./protocol";
import type { AgentRuntimePort } from "./loop/types";
import type { AgentPhaseConfig } from "./loop/phase-config";
import type {
  AgentContextMessage,
  AgentContextSkill,
  AgentLimitUsage,
  AgentRunLimits,
  ContextScope,
  LlmContext,
  LlmPhase,
  LlmPhaseOutput,
  LlmPhaseOutputEvent,
  LlmPhaseOutputMap,
  ModelCallUsage,
  ModelRef,
  ModelStreamEvent,
  Outcome,
  RuntimeDepth,
  StreamFn,
  StreamOptions,
  Task,
  TaskOutput,
  RoutingDecision,
  ThreadTaskOutput,
  ToolCall,
  ToolResult,
  ToolTaskOutput,
  VerificationResult,
} from "./protocol";
export { createId, Validators };
export type {
  AgentEffect,
  AgentLoopContext,
  AgentLoopConfig,
  AgentRunState,
  AgentRunStatus,
  AgentRuntimePort,
  AfterPhaseResult,
  BeforePhaseResult,
  ExecuteInput,
  ExecuteOutput,
  PhaseInputMap,
  PhaseOutputMap,
  PhaseResult,
  PlanInput,
  RouteInput,
  ToolRunner,
  ToolRunnerInput,
  VerifyInput,
} from "./loop/types";

export type {
  AgentLimitUsage,
  AgentRunLimits,
  LlmContext,
  LlmPhase,
  LlmPhaseOutput,
  LlmPhaseOutputEvent,
  LlmPhaseOutputMap,
  ModelCallUsage,
  ModelRef,
  ModelStreamEvent,
  Outcome,
  RuntimeDepth,
  StreamFn,
  StreamOptions,
  Task,
  TaskOutput,
  RoutingDecision,
  ThreadTaskOutput,
  ToolCall,
  ToolResult,
  ToolTaskOutput,
  VerificationResult,
} from "./protocol";

export const DEFAULT_MAX_THREAD_DEPTH = 4;
export const AGENT_STATE_SCHEMA_VERSION = "0.4.4";

const CONTEXT_SCOPES = ["conversation", "execution", "diagnostic"] as const;

export type AgentMessage = AgentContextMessage;
export type Skill = AgentContextSkill;

export type AgentState = {
  version: string;
  id: string;
  parentSessionId?: string;
  systemPrompt: string;
  input: string;
  task?: string;
  goal?: string;
  messages: AgentMessage[];
  skills: Skill[];
  createdAt: string;
  updatedAt: string;
  title?: string;
};

export type CreateAgentStateInput = {
  id?: string;
  systemPrompt: string;
  input: string;
  task?: string;
  goal?: string;
  skills?: Skill[];
  parentSessionId?: string;
  title?: string;
  messages?: AgentMessage[];
};

export type ToolContext = {
  state: AgentState;
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

/** Context snapshot passed into the low-level agent loop. */
export type AgentContext = {
  /** System prompt included with the request. */
  systemPrompt: string;
  /** Transcript visible to the model. */
  messages: AgentMessage[];
  /** Tools available for this run. */
  tools?: Tool[];
  /** Skills available for this run. */
  skills?: Skill[];
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

type AgentRunCommonConfig = {
  context?: AgentContext;
  model: ModelRef;
  stream: StreamFn;
  tools?: Tool[];
  maxAttempts?: number;
  limits?: AgentRunLimits;
  signal?: AbortSignal;
  runtime?: AgentRuntimePort;
  beforeToolCall?: BeforeToolCall;
  afterToolCall?: AfterToolCall;
  emit?: AgentEventListener;
};

export type AgentLoopRunConfig = AgentRunCommonConfig & {
  kind: "run";
  sessionId?: string;
  state?: AgentState;
  threadDepth?: number;
  runThread?: RunThread;
  phaseConfig?: AgentPhaseConfig;
};

export type AgentThreadRunConfig = AgentRunCommonConfig & {
  kind: "thread";
  parentSessionId: string;
  systemPrompt: string;
  prompt: string;
  task?: string;
  goal?: string;
  skills?: Skill[];
  threadDepth?: number;
};

export type AgentRunResult =
  | {
      kind: "run";
      sessionId: string;
      messages: AgentMessage[];
      outcome: Outcome;
      limitUsage: AgentLimitUsage;
      depth: RuntimeDepth;
    }
  | {
      kind: "thread";
      parentSessionId: string;
      sessionId: string;
      messages: AgentMessage[];
      outcome: Outcome;
      limitUsage: AgentLimitUsage;
      depth: RuntimeDepth;
      prompt: string;
      task?: string;
      goal?: string;
    };

type AgentThreadStartConfig =
  Omit<
    AgentThreadRunConfig,
    | "kind"
    | "parentSessionId"
    | "systemPrompt"
    | "model"
    | "stream"
    | "signal"
    | "runtime"
    | "beforeToolCall"
    | "afterToolCall"
    | "emit"
  > & {
    parentSessionId?: string;
  };

export type RunThread = (
  input: AgentThreadStartConfig,
) => Promise<Extract<AgentRunResult, { kind: "thread" }>>;

export type ErrorInfo = {
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
};

export type AgentEvent =
  | {
      type: "chat_start";
      content: AgentMessage[];
      sessionId: string;
      /** Present when this is a thread run */
      parentSessionId?: string;
      prompt?: string;
      task?: string;
      goal?: string;
      threadDepth?: number;
      maxThreadDepth?: number;
      ts: string;
    }
  | { type: "message_delta"; delta: AgentMessage | AgentMessage[]; ts: string }
  | {
      type: "chat_end";
      content: AgentMessage[];
      sessionId: string;
      /** Present when this is a thread run */
      outcome?: Outcome;
      limitUsage?: AgentLimitUsage;
      threadDepth?: number;
      maxThreadDepth?: number;
      ts: string;
    }
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
      type: "limit_exceeded";
      resource: keyof AgentLimitUsage;
      limit: number;
      usage: AgentLimitUsage;
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

export type AgentLoopInput = AgentLoopRunConfig | AgentThreadRunConfig;

export function resolveMaxThreadDepth(limits?: AgentRunLimits): number {
  const value = limits?.maxThreadDepth ?? DEFAULT_MAX_THREAD_DEPTH;
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

export function isContextScope(value: unknown): value is ContextScope {
  return CONTEXT_SCOPES.some((scope) => scope === value);
}

function defaultScopeForMessage(
  role: AgentMessage["role"],
  metadata?: Record<string, unknown>,
): ContextScope | undefined {
  if (
    metadata?.kind === "phase_prompt" ||
    metadata?.kind === "routing_decision" ||
    metadata?.kind === "model_message" ||
    metadata?.kind === "thread_output"
  ) {
    return "execution";
  }

  if (metadata?.kind === "error" || metadata?.kind === "limit_exceeded") {
    return "diagnostic";
  }

  if (role === "user" || role === "assistant") {
    return "conversation";
  }

  if (role === "tool") {
    return "execution";
  }

  return undefined;
}

export function createMessage(
  role: AgentMessage["role"],
  content: string,
  metadata?: Record<string, unknown>,
): AgentMessage {
  const scope = isContextScope(metadata?.scope) ? metadata.scope : defaultScopeForMessage(role, metadata);
  const normalizedMetadata = scope === undefined
    ? metadata
    : { ...metadata, scope };

  return {
    id: createId("msg"),
    role,
    content,
    createdAt: nowIso(),
    ...(normalizedMetadata ? { metadata: normalizedMetadata } : {}),
  };
}

export function messageScope(message: AgentMessage): ContextScope | undefined {
  const scope = message.metadata?.scope;
  return isContextScope(scope) ? scope : undefined;
}

export function isConversationMessage(message: AgentMessage): boolean {
  return messageScope(message) === "conversation";
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createAgentState(input: CreateAgentStateInput): AgentState {
  const createdAt = nowIso();
  const messages = input.messages?.map(clone) ?? [
    createMessage("user", input.input, { scope: "conversation" }),
  ];

  return {
    version: AGENT_STATE_SCHEMA_VERSION,
    id: input.id ?? createId("ses"),
    ...(input.parentSessionId ? { parentSessionId: input.parentSessionId } : {}),
    systemPrompt: input.systemPrompt,
    input: input.input,
    ...(input.task ? { task: input.task } : {}),
    ...(input.goal ? { goal: input.goal } : {}),
    messages,
    skills: input.skills?.map(clone) ?? [],
    createdAt,
    updatedAt: createdAt,
    ...(input.title ? { title: input.title } : {}),
  };
}

export function latestUserInput(state: Pick<AgentState, "input" | "messages">): string {
  for (let index = state.messages.length - 1; index >= 0; index -= 1) {
    const message = state.messages[index];
    if (message.role === "user" && isConversationMessage(message)) {
      return message.content;
    }
  }

  return state.input;
}
