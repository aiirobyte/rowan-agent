import type { DurableRunEvent } from "@rowan-agent/agent";

export type DurableRunEventLogLevel = "debug" | "info" | "warn" | "error" | "silent";
export type WritableDurableRunEventLogLevel = Exclude<DurableRunEventLogLevel, "silent">;

export const DURABLE_RUN_EVENT_LOG_LEVEL_VALUES = {
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
} satisfies Record<WritableDurableRunEventLogLevel, number>;

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

export function eventLogLevel(event: DurableRunEvent): WritableDurableRunEventLogLevel {
  if (event.kind === "message_committed") {
    return "debug";
  }
  if (event.kind === "run_transitioned" && event.to === "failed") {
    return "warn";
  }
  return "info";
}

export function shouldWriteEvent(eventLevel: WritableDurableRunEventLogLevel, configuredLevel: WritableDurableRunEventLogLevel): boolean {
  return DURABLE_RUN_EVENT_LOG_LEVEL_VALUES[eventLevel] >= DURABLE_RUN_EVENT_LOG_LEVEL_VALUES[configuredLevel];
}

export function createDurableRunEventLogFields(event: DurableRunEvent, includeEventPayload: boolean): Record<string, unknown> {
  return {
    eventType: event.kind,
    eventTs: event.createdAt,
    agentId: event.agentId,
    runId: event.runId,
    ...(includeEventPayload ? { event } : {}),
  };
}
