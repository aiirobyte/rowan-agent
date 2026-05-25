import type {
  Outcome,
  Task,
  ToolResult,
  ToolTaskOutput,
  VerificationResult,
} from "../types";
import { createId, Validators } from "../types";
import { errorMessage, type LimitExceededError } from "./errors";

export function stringifyTaskOutput(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value) ?? String(value);
}

export function createUnverifiedTaskOutcome(
  input: { lastExecuteText?: string },
  task: Task,
  toolResults: ToolResult[],
): Outcome {
  const failedResult = toolResults.find((result) => !result.ok);
  const outputResult = failedResult ?? [...toolResults].reverse().find((result) => result.ok);
  const message = outputResult
    ? (outputResult.error ?? stringifyTaskOutput(outputResult.content))
    : (input.lastExecuteText ?? "Task completed without local verification.");

  return Validators.outcome.Parse({
    id: createId("out"),
    taskId: task.id,
    passed: !failedResult,
    message,
  });
}

export function createToolTaskOutput(toolResults: ToolResult[]): ToolTaskOutput {
  return {
    kind: "tools",
    toolResults,
  };
}

export function createLimitExceededOutcome(error: LimitExceededError, task?: Task): Outcome {
  return Validators.outcome.Parse({
    id: createId("out"),
    ...(task ? { taskId: task.id } : {}),
    passed: false,
    message: error.message,
  });
}

export function createThreadDepthLimitOutcome(input: { threadDepth: number; maxThreadDepth: number }): Outcome {
  return Validators.outcome.Parse({
    id: createId("out"),
    passed: false,
    message: `Thread depth limit exceeded (${input.threadDepth}/${input.maxThreadDepth}).`,
  });
}

export function createSkippedOutcome(): Outcome {
  return Validators.outcome.Parse({
    id: "skip",
    passed: true,
    message: "Skipped.",
  });
}

export function createDefaultPhaseOutcome(): Outcome {
  return Validators.outcome.Parse({
    id: "default",
    passed: true,
    message: "Phase completed.",
  });
}

export function createInvalidModelVerification(_task: Task, _error: unknown): VerificationResult {
  const message = "Model returned invalid verification output.";
  return Validators.verificationResult.Parse({
    passed: false,
    message,
  });
}

export function createInvalidExecuteToolResult(error: unknown): ToolResult {
  return Validators.toolResult.Parse({
    toolCallId: createId("call"),
    toolName: "model.execute",
    ok: false,
    content: null,
    error: errorMessage(error),
  });
}
