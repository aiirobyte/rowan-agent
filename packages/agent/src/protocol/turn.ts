import type { AgentContextMessage, ContextScope } from "./context";
import type { LlmModelUsage, LlmModelRef } from "./model";
import type { LoopPhase } from "./phase";
import type { ToolCall, ToolResult } from "./tool";

export type ExecutionTurnEntry =
  | { kind: "prompt"; message: Pick<AgentContextMessage, "role" | "content"> }
  | { kind: "assistant_text"; text: string }
  | { kind: "tool_call"; toolCall: ToolCall }
  | { kind: "tool_result"; result: ToolResult };

export type ExecutionTurn = {
  id: string;
  sessionId: string;
  parentSessionId?: string;
  phase: LoopPhase;
  requestedAtMs: number;
  completedAtMs: number;
  model: LlmModelRef;
  usage?: LlmModelUsage;
  scope: ContextScope;
  entries: ExecutionTurnEntry[];
};

export type StepFilter = {
  phase?: LoopPhase;
  afterMs?: number;
  scope?: ExecutionTurn["scope"];
};
