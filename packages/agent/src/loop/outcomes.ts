import type { Outcome } from "../types";
import { createId } from "../types";
import type { LimitExceededError } from "./errors";

export function createLimitExceededOutcome(error: LimitExceededError): Outcome {
  return { id: createId("out"), passed: false, message: error.message };
}

export function createThreadDepthLimitOutcome(input: { threadDepth: number; maxThreadDepth: number }): Outcome {
  return { id: createId("out"), passed: false, message: `Thread depth limit exceeded (${input.threadDepth}/${input.maxThreadDepth}).` };
}

export function createSkippedOutcome(): Outcome {
  return { id: "skip", passed: true, message: "Skipped." };
}

export function createDefaultPhaseOutcome(): Outcome {
  return { id: "default", passed: true, message: "Phase completed." };
}

export function createDefaultOutcome(output: { message: string }): Outcome {
  return { id: createId("out"), passed: true, message: output.message || "Completed." };
}

export function createMaxVisitsOutcome(phaseId: string): Outcome {
  return { id: createId("out"), passed: false, message: `Phase "${phaseId}" exceeded maximum visit limit.` };
}
