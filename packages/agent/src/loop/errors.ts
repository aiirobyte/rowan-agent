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

/** Error thrown when a routed phase needs a route tool call but the model did not emit one. */
export class MissingRouteToolCallError extends Error {
  readonly code = "missing_route_tool_call";
  readonly phase: string;
  readonly toolCallNames: string[];

  constructor(phase: string, toolCallNames: string[]) {
    super(
      `Phase "${phase}" requires a route tool call, but the model did not emit one.`,
    );
    this.name = "MissingRouteToolCallError";
    this.phase = phase;
    this.toolCallNames = toolCallNames;
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
