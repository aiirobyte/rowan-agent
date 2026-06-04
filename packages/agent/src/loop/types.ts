import type {
  AgentMessage,
  AgentEvent,
  AgentEventListener,
  AgentState,
  AfterToolCall,
  BeforeToolCall,
  LlmModelRef,
  Outcome,
  StreamFn,
  Tool,
  ToolCall,
  ToolResult,
} from "../types";
import type { PhaseRegistry, PhaseInput, PhaseOutput } from "./phases/registry";
import type { BeforePhaseHookResult, AfterPhaseHookResult } from "../extensions";

export type AgentRunLimits = {
  /** Maximum number of phase iterations before forcing stop. Default: 50. */
  maxIterations?: number;
  /** Maximum consecutive "continue" rounds within a single phase before forcing transition. Default: 10. */
  maxPhaseRounds?: number;
};

export type BeforePhaseHook = (phaseId: string, input: PhaseInput) => Promise<BeforePhaseHookResult>;
export type AfterPhaseHook = (phaseId: string, output: PhaseOutput) => Promise<AfterPhaseHookResult>;
export type BeforePromptHook = (phaseId: string, input: PhaseInput) => Promise<PhaseInput>;

export type AgentLoopConfig = {
  model: LlmModelRef;
  stream: StreamFn;
  tools: Tool[];
  maxAttempts: number;
  limits?: AgentRunLimits;
  signal?: AbortSignal;
  runtime?: AgentRuntimePort;
  beforeToolCall?: BeforeToolCall;
  afterToolCall?: AfterToolCall;
  beforePhase?: BeforePhaseHook;
  afterPhase?: AfterPhaseHook;
  beforePrompt?: BeforePromptHook;
  emit?: AgentEventListener;
  phaseConfig?: PhaseRegistry;
};

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

export type AgentRunState = {
  agentState: AgentState;
  currentPhase: string;
  attempt: number;
  transcript: AgentMessage[];
  /** Loop execution metrics. */
  metrics: LoopMetrics;
};

export type AgentMessageSnapshot = AgentMessage;

export type AgentLoopContext = {
  /** System prompt included with the request. */
  systemPrompt: string;
  /** Transcript visible to the model. */
  messages: AgentMessageSnapshot[];
  /** Tools available for this run. */
  tools: Tool[];
  /** Skills available for this run. */
  skills: AgentState["skills"];
  config: AgentLoopConfig;
  state: AgentRunState;
  signal?: AbortSignal;
  emit(event: AgentEvent): void;
  appendMessage(message: AgentMessageSnapshot): void;
  appendStateMessage(message: AgentMessageSnapshot): void;
};

export type AgentEffect =
  | { type: "event"; event: AgentEvent }
  | { type: "event_message"; message: AgentMessageSnapshot }
  | { type: "agent_state_message"; message: AgentMessageSnapshot };

export type PhaseResult =
  | { action: "continue"; output: PhaseOutput; effects?: AgentEffect[] }
  | { action: "skip"; output: PhaseOutput; reason?: string }
  | { action: "retry"; input?: PhaseInput; reason?: string }
  | { action: "abort"; outcome: Outcome; reason?: string };

export type ToolRunnerInput = {
  context: AgentLoopContext;
  toolCall: ToolCall;
};

export type ToolRunner = (input: ToolRunnerInput) => Promise<ToolResult>;

export type AgentRuntimePort = {
  tools?: ToolRunner;
};
