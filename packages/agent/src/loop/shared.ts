import type {
  AgentLimitUsage,
  AgentMessage,
  AgentState,
  Outcome,
  RuntimeDepth,
  Task,
  ToolResult,
  ToolTaskOutput,
  VerificationResult,
} from "../types";
import { createId, Validators } from "../types";

export class LimitExceededError extends Error {
  readonly resource: keyof AgentLimitUsage;
  readonly limit: number;
  readonly usage: AgentLimitUsage;

  constructor(input: { resource: keyof AgentLimitUsage; limit: number; usage: AgentLimitUsage }) {
    const label = input.resource === "modelCalls" ? "model calls" : "tool calls";
    super(`Agent run exceeded ${label} limit (${input.usage[input.resource]}/${input.limit}).`);
    this.name = "LimitExceededError";
    this.resource = input.resource;
    this.limit = input.limit;
    this.usage = { ...input.usage };
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

export function isInvalidModelSchemaError(error: unknown): boolean {
  return errorCode(error) === "invalid_model_schema";
}

export function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Agent run aborted.");
  }
}

export function cloneLimitUsage(usage: AgentLimitUsage): AgentLimitUsage {
  return {
    modelCalls: usage.modelCalls,
    toolCalls: usage.toolCalls,
  };
}

export function snapshotMessage(message: AgentMessage): AgentMessage {
  return {
    ...message,
    ...(message.metadata ? { metadata: { ...message.metadata } } : {}),
  };
}

export function snapshotMessages(messages: AgentMessage[]): AgentMessage[] {
  return messages.map(snapshotMessage);
}

export function runtimeDepth(input: {
  threadDepth: number;
  maxThreadDepth: number;
}): RuntimeDepth {
  return {
    threadDepth: input.threadDepth,
    maxThreadDepth: input.maxThreadDepth,
  };
}

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
