import type {
  AcceptanceCriterion,
  Outcome,
  Task,
  TaskRoutingDecision,
  VerificationResult,
} from "./types";
import { createId, Validators } from "./types";

export function parseTask(value: unknown): Task {
  return Validators.task.Parse(value);
}

export function parseTaskRoutingDecision(value: unknown): TaskRoutingDecision {
  return Validators.taskRoutingDecision.Parse(value);
}

export function normalizeVerificationResult(value: VerificationResult): VerificationResult {
  return Validators.verificationResult.Parse({
    ...value,
    passed: value.passed && value.failedCriteria.length === 0,
  });
}

export function parseVerificationResult(value: unknown): VerificationResult {
  return normalizeVerificationResult(Validators.verificationResult.Parse(value));
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
  const normalizedVerification = normalizeVerificationResult(verification);
  return Validators.outcome.Parse({
    id: createId("out"),
    taskId: task.id,
    passed: normalizedVerification.passed,
    message: normalizedVerification.message,
    evidence: normalizedVerification.evidence,
    failedCriteria: normalizedVerification.failedCriteria,
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

export function createDirectOutcome(message: string): Outcome {
  return Validators.outcome.Parse({
    id: createId("out"),
    passed: true,
    message,
    evidence: [],
    failedCriteria: [],
  });
}
