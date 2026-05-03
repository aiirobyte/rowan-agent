import type { Session as CoreSession } from "@rowan-agent/session";
import type {
  AgentLimitUsage,
  AgentEvent,
  AgentRunLimits,
  AfterToolCall,
  BeforeToolCall,
  ExecutionTurn,
  LlmPhase,
  ModelRef,
  Outcome,
  RunThread,
  StreamFn,
  Task,
  TaskOutput,
  TaskRoutingDecision,
  Tool,
  ToolCall,
  ToolResult,
  VerificationResult,
} from "../types";

export type AgentPhaseState = "routing" | "planning" | "executing" | "verifying";

export type AgentPhaseDefinition<TPhase extends LlmPhase = LlmPhase> = {
  phase: TPhase;
  state: AgentPhaseState;
  label: string;
};

export type AgentPhaseRunner<TInput, TOutput> = (input: TInput) => Promise<TOutput>;

export type AgentPhaseModule<TPhase extends LlmPhase, TInput, TOutput> =
  AgentPhaseDefinition<TPhase> & {
    run: AgentPhaseRunner<TInput, TOutput>;
  };

export type AgentRunStatus =
  | "routing"
  | "planning"
  | "executing"
  | "verifying"
  | "completed";

export type AgentLoopConfig = {
  sessionLifecycle: "created" | "loaded" | "continued";
  model: ModelRef;
  stream: StreamFn;
  tools: Tool[];
  maxAttempts: number;
  verifyTasks: boolean;
  limits?: AgentRunLimits;
  signal?: AbortSignal;
  runtime?: AgentRuntimePort;
  beforeToolCall?: BeforeToolCall;
  afterToolCall?: AfterToolCall;
  runThread?: RunThread;
};

export type AgentRunState = {
  session: CoreSession<AgentEvent>;
  messageLog: AgentMessageSnapshot[];
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

export type AgentMessageSnapshot = CoreSession<AgentEvent>["messages"][number];

export type AgentContext = {
  config: AgentLoopConfig;
  state: Readonly<AgentRunState>;
  signal?: AbortSignal;
  emit(event: AgentEvent): Promise<void>;
  record(step: ExecutionTurn): Promise<void>;
  appendEventMessage(message: AgentMessageSnapshot): Promise<void>;
  appendSessionMessage(message: AgentMessageSnapshot): Promise<void>;
  consumeLimit(resource: keyof AgentLimitUsage): void;
  runThread?: RunThread;
};

export type RouteInput = {
  session: CoreSession<AgentEvent>;
  runtime: AgentRunState["depth"];
  tools: Tool[];
  canStartThreadRoute: boolean;
  shouldDefaultToThreadRoute: boolean;
  workerTask?: string;
  workerGoal?: string;
};

export type PlanInput = {
  session: CoreSession<AgentEvent>;
  runtime: AgentRunState["depth"];
};

export type ExecuteInput = {
  session: CoreSession<AgentEvent>;
  task: Task;
  toolResults: ToolResult[];
  runtime: AgentRunState["depth"];
};

export type VerifyInput = {
  session: CoreSession<AgentEvent>;
  task: Task;
  taskOutput: TaskOutput;
  criteria: Task["acceptanceCriteria"];
  runtime: AgentRunState["depth"];
};

export type ExecuteOutput = {
  text: string;
  toolCalls: ToolCall[];
  taskOutput: TaskOutput;
};

export type PhaseInputMap = {
  route: RouteInput;
  plan: PlanInput;
  execute: ExecuteInput;
  verify: VerifyInput;
};

export type PhaseOutputMap = {
  route: TaskRoutingDecision & { text: string };
  plan: { task: Task; text: string };
  execute: ExecuteOutput;
  verify: VerificationResult;
};

export type AgentEffect =
  | { type: "event"; event: AgentEvent }
  | { type: "turn"; turn: ExecutionTurn }
  | { type: "event_message"; message: AgentMessageSnapshot }
  | { type: "session_message"; message: AgentMessageSnapshot };

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
  context: AgentContext;
  task: Task;
  toolCall: ToolCall;
};

export type ToolRunner = (input: ToolRunnerInput) => Promise<ToolResult>;

export type AgentRuntimePort = {
  beforePhase?(
    context: AgentContext,
    phase: LlmPhase,
    input: PhaseInputMap[LlmPhase],
  ): Promise<BeforePhaseResult<LlmPhase> | void>;
  afterPhase?(
    context: AgentContext,
    phase: LlmPhase,
    output: PhaseOutputMap[LlmPhase],
  ): Promise<AfterPhaseResult<LlmPhase> | void>;
  tools?: ToolRunner;
};
