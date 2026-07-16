import type { AgentEvent } from "@rowan-agent/models";

export type AgentEventLogLevel = "debug" | "info" | "warn" | "error" | "silent";
export type WritableAgentEventLogLevel = Exclude<AgentEventLogLevel, "silent">;

export const AGENT_EVENT_LOG_LEVEL_VALUES = {
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
} satisfies Record<WritableAgentEventLogLevel, number>;

/** Local ISO-8601 timestamp with timezone offset (e.g. "2026-06-17T14:30:45.12+09:00"). */
export function formatLocalIso(date = new Date()): string {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  const iso = local.toISOString().slice(0, -1);
  const sign = offset <= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${iso}${sign}${hh}:${mm}`;
}

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

/** Whether the event is a high-frequency message update that should never become its own JSONL line. */
export function isMessageStreamUpdate(event: AgentEvent): boolean {
  return event.type === "message_update";
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
