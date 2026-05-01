import type { AcceptanceCriterion, Outcome, Task, VerificationResult } from "./types";
import { createId, Validators } from "./types";

export function parseTask(value: unknown): Task {
  return Validators.task.Parse(value);
}

export function parseVerificationResult(value: unknown): VerificationResult {
  return Validators.verificationResult.Parse(value);
}

export function createDefaultCriteria(description: string): AcceptanceCriterion[] {
  return [
    {
      id: createId("crit"),
      type: "model_judge",
      description,
      required: true,
    },
  ];
}

export function createOutcome(task: Task, verification: VerificationResult): Outcome {
  return Validators.outcome.Parse({
    id: createId("out"),
    taskId: task.id,
    passed: verification.passed,
    message: verification.message,
    evidence: verification.evidence,
    failedCriteria: verification.failedCriteria,
  });
}

export function createFailedOutcome(task: Task, verification?: VerificationResult): Outcome {
  return Validators.outcome.Parse({
    id: createId("out"),
    taskId: task.id,
    passed: false,
    message: verification?.message ?? "Task did not pass acceptance criteria.",
    evidence: verification?.evidence ?? [],
    failedCriteria:
      verification?.failedCriteria ??
      task.acceptanceCriteria.filter((criterion) => criterion.required).map((criterion) => criterion.id),
  });
}
