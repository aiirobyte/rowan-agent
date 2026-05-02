import type {
  AcceptanceCriterion,
  Outcome,
  Task,
  TaskRoutingDecision,
  VerificationResult,
} from "./types";
import { createId, Validators } from "./types";

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeThread(value: unknown): TaskRoutingDecision["thread"] | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const prompt = asNonEmptyString(record.prompt);
  const task = asNonEmptyString(record.task);
  const goal = asNonEmptyString(record.goal);
  if (!prompt || !task || !goal) {
    return undefined;
  }

  return { prompt, task, goal };
}

function normalizeTaskRoutingInput(value: unknown): TaskRoutingDecision {
  if (!isRecord(value)) {
    throw new Error("Expected route output to be an object.");
  }

  const rawRoute = asNonEmptyString(value.route)?.toLowerCase();
  const explicitRoute =
    rawRoute === "direct" || rawRoute === "task" || rawRoute === "thread" ? rawRoute : undefined;
  const rawNeedsTask =
    typeof value.needsTask === "boolean"
      ? value.needsTask
      : typeof value.needs_task === "boolean"
        ? value.needs_task
        : undefined;
  const needsTask = explicitRoute ? explicitRoute !== "direct" : rawNeedsTask ?? false;
  const route = explicitRoute ?? (needsTask ? undefined : "direct");
  const message =
    asNonEmptyString(value.message) ??
    asNonEmptyString(value.answer) ??
    asNonEmptyString(value.response) ??
    (route === "direct" ? "Done." : "Creating a task for this request.");
  const thread = normalizeThread(value.thread);

  return Validators.taskRoutingDecision.Parse({
    needsTask,
    message,
    ...(route ? { route } : {}),
    ...(thread ? { thread } : {}),
  });
}

export function parseTask(value: unknown): Task {
  return Validators.task.Parse(value);
}

export function parseTaskRoutingDecision(value: unknown): TaskRoutingDecision {
  return normalizeTaskRoutingInput(value);
}

export function normalizeVerificationResult(value: VerificationResult): VerificationResult {
  return Validators.verificationResult.Parse(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

export function parseVerificationResult(value: unknown): VerificationResult {
  return normalizeVerificationResult(normalizeVerificationInput(value));
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
  });
}

function isInternalPlanningMessage(message: string): boolean {
  return /^plan\s*:/i.test(message.trim());
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

export function createDirectOutcome(message: string): Outcome {
  return Validators.outcome.Parse({
    id: createId("out"),
    passed: true,
    message,
  });
}
