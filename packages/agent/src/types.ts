import Type from "typebox";
import type { AgentRuntimePort, AgentRunLimits, RuntimeDepth, BeforePhaseHook, AfterPhaseHook, BeforePromptHook } from "./loop/types";
import type { PhaseRegistry, PhaseInput } from "./loop/phases";
import type {
  AgentContextMessage,
  AgentContextSkill,
  ContextScope,
  LlmModelRef,
  LlmModelUsage,
  LlmRequest,
  LlmStreamEvent,
  LlmStreamOptions,
  LoopPhase,
  Outcome,
  StreamFn,
  ToolResult,
} from "./protocol";
import { createId, createTimestamp, createJson } from "./utils";

export type {
  AgentEffect,
  AgentLoopContext,
  AgentLoopConfig,
  AgentRunState,
  AgentRuntimePort,
  AfterPhaseHook,
  AfterPhaseResult,
  BeforePhaseHook,
  BeforePhaseResult,
  PhaseResult,
  ToolRunner,
  ToolRunnerInput,
} from "./loop/types";
export type { PhaseInput, PhaseOutput } from "./loop/phases";

export type {
  AgentRunLimits,
  RuntimeDepth,
} from "./loop/types";

export type {
  LlmModelRef,
  LlmModelUsage,
  LlmRequest,
  LlmStreamEvent,
  LlmStreamOptions,
  LoopPhase,
  Outcome,
  StreamFn,
  ToolCall,
  ToolResult,
} from "./protocol";

export const DEFAULT_MAX_THREAD_DEPTH = 4;
export const AGENT_STATE_SCHEMA_VERSION = "0.4.6";

const CONTEXT_SCOPES = ["conversation", "execution", "diagnostic"] as const;

export type AgentMessage = AgentContextMessage;
export type Skill = AgentContextSkill;

export type AgentState = {
  version: string;
  id: string;
  parentSessionId?: string;
  systemPrompt: string;
  input: string;
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
  skills?: Skill[];
  parentSessionId?: string;
  title?: string;
  messages?: AgentMessage[];
};

export type ToolContext = {
  state: AgentState;
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
  tool: Tool;
  args: unknown;
}) => Promise<{ allow: true } | { allow: false; reason: string }>;

export type AfterToolCall = (input: {
  tool: Tool;
  result: ToolResult;
}) => Promise<ToolResult>;

type AgentRunCommonConfig = {
  context?: AgentContext;
  model: LlmModelRef;
  stream: StreamFn;
  tools?: Tool[];
  maxAttempts?: number;
  limits?: AgentRunLimits;
  signal?: AbortSignal;
  runtime?: AgentRuntimePort;
  beforeToolCall?: BeforeToolCall;
  afterToolCall?: AfterToolCall;
  beforePhase?: BeforePhaseHook;
  afterPhase?: AfterPhaseHook;
  beforePrompt?: BeforePromptHook;
  emit?: AgentEventListener;
};

export type AgentLoopRunConfig = AgentRunCommonConfig & {
  kind: "run";
  sessionId?: string;
  state?: AgentState;
  threadDepth?: number;
  runThread?: RunThread;
  phaseConfig?: PhaseRegistry;
};

export type AgentThreadRunConfig = AgentRunCommonConfig & {
  kind: "thread";
  parentSessionId: string;
  systemPrompt: string;
  prompt: string;
  skills?: Skill[];
  threadDepth?: number;
};

export type RunResult =
  | {
      kind: "run";
      sessionId: string;
      messages: AgentMessage[];
      outcome: Outcome;
      depth: RuntimeDepth;
    }
  | {
      kind: "thread";
      parentSessionId: string;
      sessionId: string;
      messages: AgentMessage[];
      outcome: Outcome;
      depth: RuntimeDepth;
      prompt: string;
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
) => Promise<Extract<RunResult, { kind: "thread" }>>;

export type AgentEvent =
  // Agent lifecycle
  | { type: "agent_start"; sessionId: string; ts: string }
  | { type: "agent_end"; sessionId: string; messages: AgentMessage[]; ts: string }
  // Turn lifecycle
  | {
      type: "turn_start";
      content: AgentMessage[];
      parentSessionId?: string;
      prompt?: string;
      threadDepth?: number;
      maxThreadDepth?: number;
      ts: string;
    }
  | {
      type: "turn_end";
      content: AgentMessage[];
      outcome?: Outcome;
      threadDepth?: number;
      maxThreadDepth?: number;
      ts: string;
    }
  | { type: "model_requested"; model: LlmModelRef; usage: LlmModelUsage; ts: string }
  // Phase lifecycle
  | { type: "phase_start"; phase: string; ts: string }
  | { type: "phase_end"; phase: string; ts: string }
  // Message lifecycle
  | { type: "message_start"; message: AgentMessage; ts: string }
  | { type: "message_update"; message: AgentMessage; delta: string; ts: string }
  | { type: "message_end"; message: AgentMessage; ts: string }
  // Tool execution lifecycle
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; args: unknown; ts: string }
  | { type: "tool_execution_update"; toolCallId: string; toolName: string; args: unknown; partialResult: unknown; ts: string }
  | { type: "tool_execution_end"; toolCallId: string; toolName: string; result: ToolResult; isError: boolean; ts: string };

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
    createdAt: createTimestamp(),
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

export function createAgentState(input: CreateAgentStateInput): AgentState {
  const createdAt = createTimestamp();
  const messages = input.messages?.map(createJson.new) ?? [
    createMessage("user", input.input, { scope: "conversation" }),
  ];

  return {
    version: AGENT_STATE_SCHEMA_VERSION,
    id: input.id ?? createId("ses"),
    ...(input.parentSessionId ? { parentSessionId: input.parentSessionId } : {}),
    systemPrompt: input.systemPrompt,
    input: input.input,
    messages,
    skills: input.skills?.map(createJson.new) ?? [],
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
