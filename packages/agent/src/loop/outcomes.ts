import type { Outcome } from "../types";
import { createId } from "../utils";
import type { LoopResult } from "./errors";

export const createOutcome = {
  fromResult(result: LoopResult): Outcome {
    if (result.stopReason === "none") {
      return { id: createId("out"), message: "Completed." };
    }
    if (result.stopReason === "aborted") {
      return createOutcome.aborted();
    }
    return createOutcome.error(result.message);
  },

  threadDepthLimit(input: { threadDepth: number; maxThreadDepth: number }): Outcome {
    return { id: createId("out"), message: `Thread depth limit exceeded (${input.threadDepth}/${input.maxThreadDepth}).` };
  },

  phase(): Outcome {
    return { id: "default", message: "Phase completed." };
  },

  default(output: { message: string }): Outcome {
    return { id: createId("out"), message: output.message || "Completed." };
  },

  aborted(): Outcome {
    return { id: createId("out"), message: "Agent run aborted." };
  },

  error(message: string): Outcome {
    return { id: createId("out"), message };
  },
};
