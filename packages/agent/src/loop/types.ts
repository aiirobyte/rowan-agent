import type {
  AgentContext,
  AgentMessage,
  AfterToolCall,
  BeforeToolCall,
  ModelRef,
  StreamFn,
  ToolCall,
  ToolResult,
  AgentEventListener,
} from "../types";
import type { PhaseContext, PhaseOutput } from "../harness/phases/types";
import type { ModelTranscript } from "../protocol/turn";
import type { BeforePhaseHookResult, AfterPhaseHookResult } from "../extensions";
import type { AgentInputRequest } from "../runtime/domain";

export type BeforePhaseHook = (phaseId: string, input: PhaseContext) => Promise<BeforePhaseHookResult>;
export type AfterPhaseHook = (phaseId: string, output: PhaseOutput) => Promise<AfterPhaseHookResult>;
export type BeforePromptHook = (phaseId: string, input: PhaseContext) => Promise<PhaseContext>;

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

export type SessionState = {
  currentPhase: string;
  attempt: number;
  metrics: LoopMetrics;
  status: "idle" | "running" | "suspended" | "completed" | "aborted" | "failed";
  continuation?: SessionContinuationState;
};

export type SessionContinuationState = {
  isContinuing: boolean;
  previousPayload?: unknown;
  previousResults: Array<{ name: string; output?: unknown }>;
  pendingInstruction?: string;
  previousPhaseMessageId?: string;
};

export type AgentConfig = {
  model: ModelRef;
  stream: StreamFn;
  context: AgentContext;
  sessionId?: string;
  sessionState?: SessionState;
  maxAttempts?: number;
  runtime?: AgentRuntimePort;
  emit?: AgentEventListener;
  signal?: AbortSignal;
  beforeToolCall?: BeforeToolCall;
  afterToolCall?: AfterToolCall;
  beforePhase?: BeforePhaseHook;
  afterPhase?: AfterPhaseHook;
  beforePrompt?: BeforePromptHook;
  onModelTranscript?: (transcript: ModelTranscript, meta: { phase: string; model: ModelRef }) => Promise<void>;
  onMessage?: (message: AgentMessage) => Promise<void>;
  onOutcome?: (outcome: import("../types").Outcome) => Promise<void>;
  /** Internal: await next user messages before retrying the same phase. */
  waitForInput?: (state?: SessionState, inputRequest?: AgentInputRequest) => Promise<AgentMessage[]>;
};


export type ToolRunnerInput = {
  config: AgentConfig;
  toolCall: ToolCall;
};

export type ToolRunner = (input: ToolRunnerInput) => Promise<ToolResult>;

export type AgentRuntimePort = {
  tools?: ToolRunner;
};
