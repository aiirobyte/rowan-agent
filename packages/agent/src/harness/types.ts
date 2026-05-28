import Type from "typebox";
import type {
  AgentContextState,
  AgentContextSkill,
  ToolResult,
} from "../protocol";
import type { AgentRunLimits } from "../loop/types";

export { createId } from "../types";
export type {
  AgentLimitUsage,
  AgentRunLimits,
  RuntimeDepth,
} from "../loop/types";
export type {
  LlmModelRef,
  LlmModelUsage,
  LlmRequest,
  LlmStreamEvent,
  LlmStreamOptions,
  ExecutionTurn,
  ExecutionTurnEntry,
  LoopPhase,
  Outcome,
  StepFilter,
  StreamFn,
  ToolCall,
  ToolResult,
} from "../protocol";

export type RuntimeThreadInput = {
  parentSessionId?: string;
  prompt: string;
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
  tool: TTool;
  args: unknown;
}) => Promise<{ allow: true } | { allow: false; reason: string }>;

export type AfterToolCall<TTool extends Tool = Tool> = (input: {
  tool: TTool;
  result: ToolResult;
}) => Promise<ToolResult>;
