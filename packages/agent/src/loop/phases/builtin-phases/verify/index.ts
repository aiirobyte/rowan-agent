import { appendAssistantMessage } from "../../../../loop";
import type { Outcome, Task, VerificationResult } from "../../../../types";
import {
  createId,
  Validators,
} from "../../../../types";
import {
  createToolTaskOutput,
  runtimeDepth,
} from "../../../shared";
import type { VerifyInput } from "../../../types";
import { verifyTask } from "../../runtime";
import type { PhaseImplementation, PhaseTransition } from "../../config";

function isInternalPlanningMessage(message: string): boolean {
  return /^plan\s*:/i.test(message.trim());
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

export const verifyPhaseImplementation: PhaseImplementation<VerifyInput, VerificationResult> = {
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

  async run(context, input) {
    return verifyTask(context, input);
  },

  async apply(runtime, output, input): Promise<PhaseTransition> {
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
