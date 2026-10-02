import type {
  AgentContext,
  AgentMessage,
  AfterToolCall,
  BeforeToolCall,
  ModelRef,
  StreamFn,
  ToolCall,
  ToolResult,
} from "../types";
import type { PhaseContext, PhaseExecutionIdentity, PhaseInvocation, PhaseOutput, PhaseStatus } from "../harness/phases/types";
import type { RunInteractionDriver, RunInteractionState } from "../harness/phases/interactions";
import type { ModelTranscript } from "../protocol/turn";
import type { BeforePhaseResult, AfterPhaseResult } from "../extensions/hooks";
import type { ContentBlock, ThinkingLevel } from "@rowan-agent/models";
import type { JsonValue } from "../runtime-events";
import type { EntryPhaseSpec } from "../runtime/contracts";

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

export type AgentConfig = {
  model: ModelRef;
  thinkingLevel?: ThinkingLevel;
  stream: StreamFn;
  context: AgentContext;
  /** Durable Run identity passed to generated Phase callbacks. */
  execution: PhaseExecutionIdentity;
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
  onOutcome?: (outcome: import("../types").Outcome) => Promise<void>;
  /** Internal: await next user messages before retrying the same phase. */
  waitForInput?: (state?: ExecutionState, inputRequest?: InputRequestPrompt) => Promise<AgentMessage[]>;
};


export type ToolRunnerInput = {
  config: AgentConfig;
  toolCall: ToolCall;
  /** The model response's blocks, so a managed Runtime can commit them with the Tool Call. */
  contentBlocks?: readonly ContentBlock[];
  driver?: RunInteractionDriver;
};

export type ToolRunner = (input: ToolRunnerInput) => Promise<ToolResult>;
export type ToolBatchRunner = (input: {
  config: AgentConfig;
  toolCalls: readonly ToolCall[];
  contentBlocks?: readonly ContentBlock[];
  driver?: RunInteractionDriver;
}) => Promise<readonly ToolResult[]>;

export type AgentRuntimePort = {
  tools?: ToolRunner;
  toolsBatch?: ToolBatchRunner;
};
