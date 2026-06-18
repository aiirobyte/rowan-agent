import type {
  AgentContext,
  AfterToolCall,
  BeforeToolCall,
  LlmModelRef,
  StreamFn,
  ToolCall,
  ToolResult,
  AgentEventListener,
} from "../types";
import type { PhaseInput, PhaseOutput } from "../protocol/context";
import type { ModelTranscript } from "../protocol/turn";
import type { PhaseRegistry } from "../harness/phases/types";
import type { BeforePhaseHookResult, AfterPhaseHookResult } from "../extensions";

export type BeforePhaseHook = (phaseId: string, input: PhaseInput) => Promise<BeforePhaseHookResult>;
export type AfterPhaseHook = (phaseId: string, output: PhaseOutput) => Promise<AfterPhaseHookResult>;
export type BeforePromptHook = (phaseId: string, input: PhaseInput) => Promise<PhaseInput>;

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
  status: "idle" | "running" | "completed" | "aborted" | "failed";
};

export type AgentConfig = {
  context: AgentContext;
  sessionId?: string;
  model: LlmModelRef;
  stream: StreamFn;
  signal?: AbortSignal;
  emit?: AgentEventListener;
  phases?: PhaseRegistry;
  runtime?: AgentRuntimePort;
  beforeToolCall?: BeforeToolCall;
  afterToolCall?: AfterToolCall;
  beforePhase?: BeforePhaseHook;
  afterPhase?: AfterPhaseHook;
  beforePrompt?: BeforePromptHook;
  maxAttempts?: number;
  onModelTranscript?: (transcript: ModelTranscript, meta: { phase: string; model: LlmModelRef }) => Promise<void>;
  onMessage?: (message: import("../types").AgentMessage) => Promise<void>;
  onOutcome?: (outcome: import("../types").Outcome) => Promise<void>;
  sessionState?: SessionState;
};


export type ToolRunnerInput = {
  config: AgentConfig;
  toolCall: ToolCall;
};

export type ToolRunner = (input: ToolRunnerInput) => Promise<ToolResult>;

export type AgentRuntimePort = {
  tools?: ToolRunner;
};
