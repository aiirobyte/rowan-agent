import type { LlmRequest, LlmResponse } from "@rowan-agent/models";

/** Raw model input/output captured by one execution phase. */
export type ModelTranscript = {
  request: LlmRequest;
  response: LlmResponse;
};
