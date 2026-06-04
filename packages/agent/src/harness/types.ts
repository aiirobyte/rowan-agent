import Type from "typebox";
import type {
  AgentContextState,
  ToolResult,
} from "../protocol";
import type { AgentRunLimits } from "../loop/types";

export { createId } from "../utils";
export type {
  AgentRunLimits,
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

export type ToolContext = {
  state: AgentContextState;
  toolCallId: string;
};

export type ToolExecutionMode = "sequential" | "parallel";

export type Tool<TArgs = unknown> = {
  name: string;
  description: string;
  parameters: Type.TSchema;
  /** One-line snippet shown in the system prompt tool list. */
  promptSnippet?: string;
  /** Additional guidelines appended to the system prompt when this tool is active. */
  promptGuidelines?: string[];
  /** Whether this tool can run concurrently with others. Default: "parallel". */
  executionMode?: ToolExecutionMode;
  execute(
    args: TArgs,
    context: ToolContext,
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
