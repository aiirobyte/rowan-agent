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

export function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Agent run aborted.");
  }
}
