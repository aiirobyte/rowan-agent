import type { AgentEvent } from "@rowan-agent/agent";

export type AgentEventLogLevel = "debug" | "info" | "warn" | "error" | "silent";
export type WritableAgentEventLogLevel = Exclude<AgentEventLogLevel, "silent">;

export const AGENT_EVENT_LOG_LEVEL_VALUES = {
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
} satisfies Record<WritableAgentEventLogLevel, number>;

function eventSessionId(event: AgentEvent): string | undefined {
  if (
    (event.type === "chat_start" || event.type === "chat_end") &&
    "parentSessionId" in event
  ) {
    return event.parentSessionId;
  }
  if ("sessionId" in event && typeof event.sessionId === "string") {
    return event.sessionId;
  }
  return undefined;
}

function eventTaskId(event: AgentEvent): string | undefined {
  return "taskId" in event && typeof event.taskId === "string" ? event.taskId : undefined;
}

function eventPhase(event: AgentEvent): string | undefined {
  return "phase" in event && typeof event.phase === "string" ? event.phase : undefined;
}

export function eventLogLevel(event: AgentEvent): Exclude<WritableAgentEventLogLevel, "debug"> {
  if (event.type === "error") {
    return "error";
  }
  if (
    event.type === "limit_exceeded" ||
    event.type === "tool_blocked" ||
    (event.type === "tool_approval_result" && !event.decision.allow) ||
    (event.type === "verification_end" && !event.result.passed) ||
    (event.type === "outcome" && !event.outcome.passed)
  ) {
    return "warn";
  }
  return "info";
}

export function shouldWriteEvent(eventLevel: WritableAgentEventLogLevel, configuredLevel: WritableAgentEventLogLevel): boolean {
  return AGENT_EVENT_LOG_LEVEL_VALUES[eventLevel] >= AGENT_EVENT_LOG_LEVEL_VALUES[configuredLevel];
}

export function createAgentEventLogFields(event: AgentEvent, includeEventPayload: boolean): Record<string, unknown> {
  const sessionId = eventSessionId(event);
  const taskId = eventTaskId(event);
  const phase = eventPhase(event);
  return {
    eventType: event.type,
    eventTs: event.ts,
    ...(sessionId ? { sessionId } : {}),
    ...(taskId ? { taskId } : {}),
    ...(phase ? { phase } : {}),
    ...(includeEventPayload ? { event } : {}),
  };
}
