/** Stop reason for loop termination */
export type StopReason = "none" | "completed" | "aborted" | "error";

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
