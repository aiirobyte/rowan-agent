import type { ToolCallPhase, Tool, BeforeToolCall, AfterToolCall, EntryPhaseSpec } from "../runtime/contracts";
import type { AgentMessage, Skill } from "../protocol/agent";
import type {
  ModelRef,
  StreamFn,
  ToolResult,
  LlmToolCall,
  StreamBlock,
  JsonObject,
  ThinkingLevel,
} from "@rowan-agent/models";
import type { PhaseContext, PhaseExecutionIdentity, PhaseInvocation, PhaseOutput, PhaseStatus, PhaseRegistry } from "../harness/phases/types";
import type { RunInteractionDriver, RunInteractionState } from "../harness/phases/interactions";
import type { ModelTranscript } from "../protocol/turn";
import type { BeforePhaseResult, AfterPhaseResult } from "../extensions/hooks";
import type { JsonValue, Outcome, ToolResultRecord } from "../runtime-events";
import type { DelegateOptions, DelegateResult } from "./execution";

export const DEFAULT_MAX_ATTEMPTS = 16;

export function validateMaxAttempts(value: number | undefined): number | undefined {
  if (value !== undefined && (!Number.isInteger(value) || value <= 0)) {
    throw new TypeError("maxAttempts must be a positive integer.");
  }
  return value;
}

export type InputRequestPrompt = {
  phase: string;
  prompt: string;
  requestedAt: string;
};

export type BeforePhaseHook = (phaseId: string, input: PhaseContext) => Promise<BeforePhaseResult>;
export type AfterPhaseHook = (phaseId: string, output: PhaseOutput) => Promise<AfterPhaseResult>;
export type BeforePromptHook = (phaseId: string, input: PhaseContext) => Promise<PhaseContext>;
export type MessageDeltaNotification = Readonly<{
  messageId: string;
  offset: number;
  text: string;
}>;

export type ThinkingDeltaNotification = Readonly<{
  messageId: string;
  blockIndex: number;
  offset: number;
  text: string;
}>;

export type ToolCallDeltaNotification = Readonly<{
  messageId: string;
  providerToolCallId: string;
  toolName: string;
  arguments: string;
  args: JsonValue | undefined;
}>;

export type ModelRetryNotification = Readonly<{
  attempt: number;
  maxRetries: number;
  delayMs: number;
  error: string;
}>;

export type LoopMetrics = {
  /** Number of phase iterations executed. */
  iterations: number;
  /** Phase transition history. */
  phaseTransitions: Array<{ from: string; to: string; ts: string }>;
  /** Number of times compaction was triggered. */
  compactionCount: number;
  /** Number of retry attempts due to transient errors. */
  retryCount: number;
  /** Loop start timestamp. */
  startedAt: string;
  /** Loop start time as epoch ms (for duration calculation). */
  startedAtMs: number;
  /** Loop end timestamp (set on completion). */
  endedAt?: string;
  /** Total wall-clock duration in ms. */
  durationMs?: number;
};

export type ExecutionState = {
  currentPhase: string;
  attempt: number;
  metrics: LoopMetrics;
  status: "idle" | "running" | "suspended" | "completed" | "aborted" | "failed";
  initialPhasePayload?: JsonValue;
  entryPhases?: readonly EntryPhaseSpec[];
  continuation?: ExecutionContinuationState;
  runInteractions?: RunInteractionState;
  phaseInteractions?: RunInteractionState;
};

export type ExecutionContinuationState = {
  isContinuing: boolean;
  previousPayload?: unknown;
  previousResults: Array<{ name: string; output?: unknown }>;
  pendingInstruction?: string;
  previousPhaseMessageId?: string;
};

export type AgentContext = {
  /** System prompt included with the request. */
  systemPrompt: string;
  /** Transcript visible to the model. */
  messages: AgentMessage[];
  /** Tools available for this run. */
  tools: Tool[];
  /** Skills available for this run. */
  skills: Skill[];
  /** Custom phases for this run. Rowan normalizes this with the built-in default phase. */
  phases?: PhaseRegistry;
  cwd?: string;
};

export type AgentConfig = {
  model: ModelRef;
  thinkingLevel?: ThinkingLevel;
  providerOptions?: JsonObject;
  stream: StreamFn;
  context: AgentContext;
  /** Durable Run identity passed to generated Phase callbacks. */
  execution: PhaseExecutionIdentity;
  /** Consecutive Phase executions that run no Tool before the Run waits for input. */
  maxAttempts?: number;
  runtime?: AgentRuntimePort;
  signal?: AbortSignal;
  beforeToolCall?: BeforeToolCall;
  afterToolCall?: AfterToolCall;
  beforePhase?: BeforePhaseHook;
  afterPhase?: AfterPhaseHook;
  beforePrompt?: BeforePromptHook;
  onModelTranscript?: (transcript: ModelTranscript, meta: { phase: string; model: ModelRef }) => Promise<void>;
  onPhaseEntered?: (phaseId: string) => void | Promise<void>;
  onPhaseStatus?: (phaseId: string, status: PhaseStatus) => void | Promise<void>;
  onMessage?: (message: AgentMessage) => Promise<void>;
  /**
   * A parallel Phase finished with a user-visible reply. Its messages live in a
   * forked context, so the host commits the reply here or it is lost.
   */
  onParallelPhaseOutput?: (
    message: AgentMessage,
    invocation: Extract<PhaseInvocation, { mode: "parallel" }>,
  ) => Promise<void>;
  onMessageDelta?: (event: MessageDeltaNotification) => void;
  onThinkingDelta?: (event: ThinkingDeltaNotification) => void;
  onToolCallDelta?: (event: ToolCallDeltaNotification) => void;
  onModelRetry?: (event: ModelRetryNotification) => void;
  /** A provider-reported Tool Call; contentIndex counts the assistant content blocks streamed before it. */
  onToolReport?: (event: { runId: import("../runtime-events").RunId; update: import("@rowan-agent/models").ToolCall | import("@rowan-agent/models").ToolCallUpdate; contentIndex?: number }) => void;
  interact?: (request: import("@rowan-agent/models").RunInteractionRequest) => Promise<import("../runtime-events").JsonValue>;
  /** Internal / testing only: retry delay in milliseconds. */
  retryDelayMs?: number;
  onOutcome?: (outcome: Outcome) => Promise<void>;
  /** Internal: await next user messages before retrying the same phase. */
  waitForInput?: (state?: ExecutionState, inputRequest?: InputRequestPrompt) => Promise<AgentMessage[]>;
};


export type ToolRunnerInput = {
  config: AgentConfig;
  toolCall: LlmToolCall;
  /** The model response's blocks, so a managed Runtime can commit them with the Tool Call. */
  contentBlocks?: readonly StreamBlock[];
  driver?: RunInteractionDriver;
  options?: import("@rowan-agent/models").ToolCallOptions;
  /** Set when a Provider issued this call through ProviderCallContext.tools.call. */
  providerInitiated?: boolean;
  model?: import("@rowan-agent/models").ModelRef;
  usage?: import("@rowan-agent/models").LlmTokenUsage;
  phase?: ToolCallPhase;
};

export type ToolRunner = (input: ToolRunnerInput) => Promise<ToolResult>;
export type ToolBatchRunner = (input: {
  config: AgentConfig;
  toolCalls: readonly LlmToolCall[];
  contentBlocks?: readonly StreamBlock[];
  driver?: RunInteractionDriver;
  options?: import("@rowan-agent/models").ToolCallOptions;
  model?: import("@rowan-agent/models").ModelRef;
  usage?: import("@rowan-agent/models").LlmTokenUsage;
  phase?: ToolCallPhase;
}) => Promise<readonly ToolResult[]>;

export type AgentRuntimePort = {
  tools?: ToolRunner;
  toolsBatch?: ToolBatchRunner;
  interact?: (request: import("@rowan-agent/models").RunInteractionRequest) => Promise<import("../runtime-events").JsonValue>;
  /** Create or continue a child Agent of the Agent running the Phase; the key is always set. */
  delegate?: (options: DelegateOptions & { idempotencyKey: string }) => Promise<DelegateResult>;
};
