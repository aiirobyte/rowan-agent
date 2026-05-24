import Type from "typebox";
import type {
  AgentContextState,
  AgentContextSkill,
  AgentRunLimits,
  Task,
  ToolResult,
} from "../protocol";

export { createId, Validators } from "../protocol";
export type {
  AgentLimitUsage,
  AgentRunLimits,
  ExecutionTurn,
  ExecutionTurnEntry,
  LlmContext,
  LlmPhase,
  ModelCallUsage,
  ModelRef,
  ModelStreamEvent,
  Outcome,
  RuntimeDepth,
  StepFilter,
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
} from "../protocol";

export type RuntimeThreadInput = {
  parentSessionId?: string;
  prompt: string;
  task?: string;
  goal?: string;
  tools: Tool[];
  skills?: AgentContextSkill[];
  maxAttempts?: number;
  limits?: AgentRunLimits;
  threadDepth?: number;
  verify?: boolean;
};

export type RuntimeRunThread<
  TInput extends RuntimeThreadInput = RuntimeThreadInput,
  TResult = unknown,
> = (input: TInput) => Promise<TResult>;

export type ToolContext<
  TThreadResult = unknown,
  TThreadInput extends RuntimeThreadInput = RuntimeThreadInput,
> = {
  state: AgentContextState;
  task: Task;
  toolCallId: string;
  runThread?: RuntimeRunThread<TThreadInput, TThreadResult>;
};

export type Tool<
  TArgs = unknown,
  TThreadResult = unknown,
  TThreadInput extends RuntimeThreadInput = RuntimeThreadInput,
> = {
  name: string;
  description: string;
  parameters: Type.TSchema;
  execute(
    args: TArgs,
    context: ToolContext<TThreadResult, TThreadInput>,
    signal?: AbortSignal,
  ): Promise<ToolResult>;
};

export type BeforeToolCall<TTool extends Tool = Tool> = (input: {
  task: Task;
  tool: TTool;
  args: unknown;
}) => Promise<{ allow: true } | { allow: false; reason: string }>;

export type AfterToolCall<TTool extends Tool = Tool> = (input: {
  task: Task;
  tool: TTool;
  result: ToolResult;
}) => Promise<ToolResult>;
