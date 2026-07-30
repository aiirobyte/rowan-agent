/** Stop reason for loop termination */
export type StopReason = "none" | "completed" | "aborted" | "error";

/** Error thrown when the model returns an empty response (no text, no tool calls). */
export class EmptyResponseError extends Error {
  readonly code = "empty_response";
  constructor(message = "Model returned an empty response.") {
    super(message);
    this.name = "EmptyResponseError";
  }
}

/** Error thrown before an unbounded provider stream can exhaust process memory. */
export class ModelOutputLimitError extends Error {
  readonly code = "model_output_limit";
  constructor(readonly limit: number) {
    super(`Model output exceeded the ${limit}-character safety limit.`);
    this.name = "ModelOutputLimitError";
  }
}

/** Result with stop reason */
export type LoopResult = {
  stopReason: "none";
} | {
  stopReason: Exclude<StopReason, "none">;
  message: string;
};

/** Loop guard functions - pure, no exceptions */
export const LoopGuard = {
  /** Returns abort result if signal is aborted */
  checkAbort(signal?: AbortSignal): LoopResult {
    if (signal?.aborted) {
      return { stopReason: "aborted", message: "Agent run aborted." };
    }
    return { stopReason: "none" };
  },
};
