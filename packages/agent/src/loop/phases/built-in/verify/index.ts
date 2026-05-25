import { appendAssistantMessage } from "../../../../agent-loop";
import { createId, Validators } from "../../../../types";
import type { LoopPhaseOutputMap, Outcome, Task, VerificationResult } from "../../../../types";
import { isInvalidModelSchemaError } from "../../../errors";
import {
  createInvalidModelVerification,
  createToolTaskOutput,
} from "../../../outcomes";
import { runtimeDepth } from "../../../state";
import type { VerifyInput } from "../../../types";
import type { BuiltinPhaseExtension } from "../types";
import manifestJson from "./manifest.json";
import type { PhaseConfigTemplatePhase } from "../../config";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInternalPlanningMessage(message: string): boolean {
  return /^plan\s*:/i.test(message.trim());
}

function normalizeVerificationInput(value: unknown): VerificationResult {
  if (!isRecord(value)) {
    throw new Error("Expected verify output to be an object.");
  }

  if (typeof value.passed !== "boolean") {
    throw new Error("Expected verify output to include boolean passed.");
  }

  const passed = value.passed;
  const message =
    typeof value.message === "string" && value.message.trim().length > 0
      ? value.message
      : passed === true
        ? "Task passed."
        : "Task failed.";

  return Validators.verificationResult.Parse({
    passed,
    message,
  });
}

function parseVerificationResult(value: unknown): VerificationResult {
  return Validators.verificationResult.Parse(normalizeVerificationInput(value));
}

export function createOutcome(task: Task, verification: VerificationResult): Outcome {
  const normalizedVerification = Validators.verificationResult.Parse(verification);
  return Validators.outcome.Parse({
    id: createId("out"),
    taskId: task.id,
    passed: normalizedVerification.passed,
    message: normalizedVerification.message,
  });
}

export function createFailedOutcome(task: Task, verification?: VerificationResult): Outcome {
  const message =
    verification?.message && !isInternalPlanningMessage(verification.message)
      ? verification.message
      : "Task did not pass acceptance criteria.";

  return Validators.outcome.Parse({
    id: createId("out"),
    taskId: task.id,
    passed: false,
    message,
  });
}

export const verifyExtension: BuiltinPhaseExtension<VerifyInput, VerificationResult> = {
  manifest: manifestJson as PhaseConfigTemplatePhase,

  definition: {
    id: "verify",
    name: "Verify",
    description: "Judge whether the task output satisfies the task acceptance criteria.",
    modelPhase: "verify",
    async run(context, input) {
      let collected;
      try {
        collected = await context.model.collect({
          phase: "verify",
          payload: {
            phase: "verify",
            state: input.state,
            task: input.task,
            taskOutput: input.taskOutput,
            criteria: input.criteria,
            runtime: input.runtime,
          },
        });
      } catch (error) {
        if (!isInvalidModelSchemaError(error)) {
          throw error;
        }
        return createInvalidModelVerification(input.task, error);
      }

      const phaseOutput = collected.phaseOutput as LoopPhaseOutputMap["verify"] | undefined;
      const rawVerification = phaseOutput ?? collected.structured;
      return rawVerification
        ? parseVerificationResult(rawVerification)
        : {
            passed: false,
            message: "Verifier did not produce structured output.",
          };
    },
  },

  buildInput(runtime) {
    const task = runtime.currentTask!;
    const taskOutput = createToolTaskOutput(runtime.toolResults);

    return {
      state: runtime.agentState,
      task,
      taskOutput,
      criteria: task.acceptanceCriteria,
      runtime: runtimeDepth(runtime),
    };
  },

  async applyOutput({ runtime, phaseInput: input, phaseOutput: output }) {
    if (output.passed) {
      input.task.status = "passed";
      const outcome = createOutcome(input.task, output);
      await appendAssistantMessage(runtime, outcome.message, {
        kind: "task_outcome",
        taskId: input.task.id,
      });
      return { type: "stop", outcome };
    }

    const maxAttempts = runtime.maxAttempts ?? 2;
    if (runtime.attempt < maxAttempts) {
      return { type: "next", phaseId: "execute" };
    }

    input.task.status = "failed";
    const outcome = createFailedOutcome(input.task, output);
    return { type: "stop", outcome };
  },
};

export type { VerifyInput } from "../../../types";
