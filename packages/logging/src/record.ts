import type { AgentEvent } from "@rowan-agent/models";

export type AgentEventLogLevel = "debug" | "info" | "warn" | "error" | "silent";
export type WritableAgentEventLogLevel = Exclude<AgentEventLogLevel, "silent">;

export const AGENT_EVENT_LOG_LEVEL_VALUES = {
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
} satisfies Record<WritableAgentEventLogLevel, number>;

function eventSessionId(event: AgentEvent): string | undefined {
  if (event.type === "agent_start" || event.type === "agent_end") {
    return event.sessionId;
  }
  return undefined;
}

function eventPhase(event: AgentEvent): string | undefined {
  return "phase" in event && typeof event.phase === "string" ? event.phase : undefined;
}

export function eventLogLevel(event: AgentEvent): WritableAgentEventLogLevel {
  if (event.type === "message_update" || event.type === "tool_execution_update") {
    return "debug";
  }
  if (event.type === "tool_execution_end" && event.isError) {
    return "warn";
  }
  return "info";
}

export function shouldWriteEvent(eventLevel: WritableAgentEventLogLevel, configuredLevel: WritableAgentEventLogLevel): boolean {
  return AGENT_EVENT_LOG_LEVEL_VALUES[eventLevel] >= AGENT_EVENT_LOG_LEVEL_VALUES[configuredLevel];
}

export function createAgentEventLogFields(event: AgentEvent, includeEventPayload: boolean): Record<string, unknown> {
  const sessionId = eventSessionId(event);
  const phase = eventPhase(event);
  return {
    eventType: event.type,
    eventTs: event.ts,
    ...(sessionId ? { sessionId } : {}),
    ...(phase ? { phase } : {}),
    ...(includeEventPayload ? { event } : {}),
  };
}
