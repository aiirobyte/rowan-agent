import type { Outcome } from "../types";
import { createId } from "../utils";
import type { LoopResult } from "./errors";

export const createOutcome = {
  fromResult(result: LoopResult): Outcome {
    if (result.stopReason === "none") {
      return { id: createId("out"), passed: true, message: "Completed." };
    }
    if (result.stopReason === "aborted") {
      return createOutcome.aborted();
    }
    return createOutcome.error(result.message);
  },

  threadDepthLimit(input: { threadDepth: number; maxThreadDepth: number }): Outcome {
    return { id: createId("out"), passed: false, message: `Thread depth limit exceeded (${input.threadDepth}/${input.maxThreadDepth}).` };
  },

  phase(): Outcome {
    return { id: "default", passed: true, message: "Phase completed." };
  },

  default(output: { message: string }): Outcome {
    return { id: createId("out"), passed: true, message: output.message || "Completed." };
  },

  aborted(): Outcome {
    return { id: createId("out"), passed: false, message: "Agent run aborted." };
  },

  error(message: string): Outcome {
    return { id: createId("out"), passed: false, message };
  },
};
