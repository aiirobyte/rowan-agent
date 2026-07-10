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
