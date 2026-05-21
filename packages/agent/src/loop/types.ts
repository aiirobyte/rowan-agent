import type {
  AgentMessage,
  AgentLimitUsage,
  AgentEvent,
  AgentRunLimits,
  AgentState,
  AfterToolCall,
  BeforeToolCall,
  LlmPhase,
  LlmPhaseOutputMap,
  ModelRef,
  Outcome,
  RunThread,
  StreamFn,
  Task,
  TaskOutput,
  Tool,
  ToolCall,
  ToolResult,
  VerificationResult,
} from "../types";

export type AgentRunStatus =
  | "routing"
  | "planning"
  | "executing"
  | "verifying"
  | "completed";

export type AgentLoopConfig = {
  model: ModelRef;
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
  status: AgentRunStatus;
  attempt: number;
  task?: Task;
  toolResults: ToolResult[];
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
  state: Readonly<AgentRunState>;
  signal?: AbortSignal;
  emit(event: AgentEvent): Promise<void>;
  appendMessage(message: AgentMessageSnapshot): Promise<void>;
  appendStateMessage(message: AgentMessageSnapshot): Promise<void>;
  consumeLimit(resource: keyof AgentLimitUsage): void;
  runThread?: RunThread;
};

export type RouteInput = {
  state: AgentState;
  runtime: AgentRunState["depth"];
  tools: Tool[];
  canStartThreadRoute: boolean;
  shouldDefaultToThreadRoute: boolean;
  workerTask?: string;
  workerGoal?: string;
};

export type PlanInput = {
  state: AgentState;
  runtime: AgentRunState["depth"];
};

export type ExecuteInput = {
  state: AgentState;
  task: Task;
  toolResults: ToolResult[];
  runtime: AgentRunState["depth"];
};

export type VerifyInput = {
  state: AgentState;
  task: Task;
  taskOutput: TaskOutput;
  criteria: Task["acceptanceCriteria"];
  runtime: AgentRunState["depth"];
};

export type ExecuteOutput = LlmPhaseOutputMap["execute"] & {
  taskOutput: TaskOutput;
};

export type PhaseInputMap = {
  route: RouteInput;
  plan: PlanInput;
  execute: ExecuteInput;
  verify: VerifyInput;
};

export type PhaseOutputMap = {
  route: LlmPhaseOutputMap["route"];
  plan: LlmPhaseOutputMap["plan"];
  execute: ExecuteOutput;
  verify: LlmPhaseOutputMap["verify"];
};

export type AgentEffect =
  | { type: "event"; event: AgentEvent }
  | { type: "event_message"; message: AgentMessageSnapshot }
  | { type: "agent_state_message"; message: AgentMessageSnapshot };

export type PhaseResult<TPhase extends LlmPhase> =
  | { action: "continue"; output: PhaseOutputMap[TPhase]; effects?: AgentEffect[] }
  | { action: "skip"; output: PhaseOutputMap[TPhase]; reason?: string }
  | { action: "retry"; input?: PhaseInputMap[TPhase]; reason?: string }
  | { action: "abort"; outcome: Outcome; reason?: string };

export type BeforePhaseResult<TPhase extends LlmPhase> =
  | { input?: PhaseInputMap[TPhase] }
  | { skip: PhaseOutputMap[TPhase] }
  | { abort: Outcome };

export type AfterPhaseResult<TPhase extends LlmPhase> =
  | { output?: PhaseOutputMap[TPhase] }
  | { retry?: PhaseInputMap[TPhase] }
  | { abort: Outcome };

export type ToolRunnerInput = {
  context: AgentLoopContext;
  task: Task;
  toolCall: ToolCall;
};

export type ToolRunner = (input: ToolRunnerInput) => Promise<ToolResult>;

export type AgentRuntimePort = {
  beforePhase?(
    context: AgentLoopContext,
    phase: LlmPhase,
    input: PhaseInputMap[LlmPhase],
  ): Promise<BeforePhaseResult<LlmPhase> | void>;
  afterPhase?(
    context: AgentLoopContext,
    phase: LlmPhase,
    output: PhaseOutputMap[LlmPhase],
  ): Promise<AfterPhaseResult<LlmPhase> | void>;
  tools?: ToolRunner;
};
