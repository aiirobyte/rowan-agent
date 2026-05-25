import type { AgentLimitUsage } from "../types";

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
