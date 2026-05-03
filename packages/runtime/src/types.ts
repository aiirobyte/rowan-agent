import Type from "typebox";
import type { Session as CoreSession, Skill } from "@rowan-agent/session";
import type {
  AgentRunLimits,
  Task,
  ToolResult,
} from "@rowan-agent/protocol";

export { createId, Validators } from "@rowan-agent/protocol";
export type {
  AcceptanceCriterion,
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
  TaskRoutingDecision,
  ThreadTaskOutput,
  ToolCall,
  ToolResult,
  ToolTaskOutput,
  VerificationResult,
} from "@rowan-agent/protocol";

export type RuntimeThreadInput = {
  parentSessionId?: string;
  prompt: string;
  task?: string;
  goal?: string;
  tools: Tool[];
  skills?: Skill[];
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
  TLogEvent = unknown,
  TThreadResult = unknown,
  TThreadInput extends RuntimeThreadInput = RuntimeThreadInput,
> = {
  session: CoreSession<TLogEvent>;
  task: Task;
  toolCallId: string;
  runThread?: RuntimeRunThread<TThreadInput, TThreadResult>;
};

export type Tool<
  TArgs = unknown,
  TLogEvent = unknown,
  TThreadResult = unknown,
  TThreadInput extends RuntimeThreadInput = RuntimeThreadInput,
> = {
  name: string;
  description: string;
  parameters: Type.TSchema;
  execute(
    args: TArgs,
    context: ToolContext<TLogEvent, TThreadResult, TThreadInput>,
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
