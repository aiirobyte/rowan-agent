import type { AgentContextMessage } from "./context";
import type { LlmModelUsage, LlmModelRef } from "./model";
import type { ToolCall, ToolResult } from "./tool";
import type { LlmRequest, LlmResponse } from "@rowan-agent/models";

export type ExecutionTurnEntry =
  | { kind: "prompt"; message: Pick<AgentContextMessage, "role" | "content"> }
  | { kind: "assistant_text"; text: string }
  | { kind: "tool_call"; toolCall: ToolCall }
  | { kind: "tool_result"; result: ToolResult };

export type ExecutionTurn = {
  id: string;
  sessionId: string;
  parentSessionId?: string;
  phase: string;
  requestedAtMs: number;
  completedAtMs: number;
  model: LlmModelRef;
  usage?: LlmModelUsage;
  entries: ExecutionTurnEntry[];
};

export type StepFilter = {
  phase?: string;
  afterMs?: number;
};

/** Raw model input/output for session persistence. */
export type ModelTranscript = {
  request: LlmRequest;
  response: LlmResponse;
};
