import type {
  AgentMessage,
  AgentEvent,
  AgentState,
  AfterToolCall,
  BeforeToolCall,
  LoopPhase,
  LlmModelRef,
  Outcome,
  RunThread,
  StreamFn,
  Tool,
  ToolCall,
  ToolResult,
} from "../types";

export type AgentRunLimits = {
  maxToolCalls?: number;
  maxModelCalls?: number;
  maxThreadDepth?: number;
};

export type AgentLimitUsage = {
  toolCalls: number;
  modelCalls: number;
};

export type RuntimeDepth = {
  threadDepth: number;
  maxThreadDepth: number;
};

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
  runThread?: RunThread;
};

export type AgentRunState = {
  agentState: AgentState;
  currentPhase: string;
  attempt: number;
  limitUsage: AgentLimitUsage;
  depth: {
    threadDepth: number;
    maxThreadDepth: number;
  };
  lastExecuteText?: string;
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
  emit(event: AgentEvent): Promise<void>;
  appendMessage(message: AgentMessageSnapshot): Promise<void>;
  appendStateMessage(message: AgentMessageSnapshot): Promise<void>;
  consumeLimit(resource: keyof AgentLimitUsage): void;
  runThread?: RunThread;
};

export type AgentEffect =
  | { type: "event"; event: AgentEvent }
  | { type: "event_message"; message: AgentMessageSnapshot }
  | { type: "agent_state_message"; message: AgentMessageSnapshot };

import type { PhaseInput, PhaseOutput } from "./phases/config";

export type PhaseResult =
  | { action: "continue"; output: PhaseOutput; effects?: AgentEffect[] }
  | { action: "skip"; output: PhaseOutput; reason?: string }
  | { action: "retry"; input?: PhaseInput; reason?: string }
  | { action: "abort"; outcome: Outcome; reason?: string };

export type BeforePhaseResult =
  | { input?: PhaseInput }
  | { skip: PhaseOutput }
  | { abort: Outcome };

export type AfterPhaseResult =
  | { output?: PhaseOutput }
  | { retry?: PhaseInput }
  | { abort: Outcome };

export type ToolRunnerInput = {
  context: AgentLoopContext;
  toolCall: ToolCall;
};

export type ToolRunner = (input: ToolRunnerInput) => Promise<ToolResult>;

export type AgentRuntimePort = {
  beforePhase?(
    context: AgentLoopContext,
    phase: LoopPhase,
    input: PhaseInput,
  ): Promise<BeforePhaseResult | void>;
  afterPhase?(
    context: AgentLoopContext,
    phase: LoopPhase,
    output: PhaseOutput,
  ): Promise<AfterPhaseResult | void>;
  tools?: ToolRunner;
};
