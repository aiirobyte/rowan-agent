import type { LlmModelUsage, LlmModelRef } from "./model";
import type { LlmRequest, LlmResponse } from "@rowan-agent/models";

export type ExecutionTurn = {
  id: string;
  sessionId: string;
  parentSessionId?: string;
  phase: string;
  requestedAtMs: number;
  completedAtMs: number;
  model: LlmModelRef;
  usage?: LlmModelUsage;
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
