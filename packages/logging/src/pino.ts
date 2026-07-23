import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import type { DurableRunEvent } from "@rowan-agent/agent";
import { redactSecrets } from "./redact";
import {
  createDurableRunEventLogFields,
  DURABLE_RUN_EVENT_LOG_LEVEL_VALUES,
  eventLogLevel,
  formatLocalIso,
  shouldWriteEvent,
  type DurableRunEventLogLevel,
} from "./record";

export type DurableRunEventLogPath = string | ((event: DurableRunEvent) => string | undefined);

export type DurableRunEventLoggerOptions = {
  mode?: "replace" | "append";
  level?: DurableRunEventLogLevel;
};

export type DurableRunEventLogger = ((event: DurableRunEvent) => void) & {
  path(): string | undefined;
  flush(): Promise<void>;
};

export function pinoDurableRunEventLogger(
  path: DurableRunEventLogPath,
  options: DurableRunEventLoggerOptions = {},
): DurableRunEventLogger {
  const mode = options.mode ?? "replace";
  const level = options.level ?? "info";
  let resolvedPath = typeof path === "string" ? path : undefined;
  let writtenPath: string | undefined;
  let initialized = false;
  let failure: unknown;
  const seenEventIds = new Set<string>();

  const resolvePath = (event: DurableRunEvent): string => {
    resolvedPath ??= typeof path === "string" ? path : path(event);
    if (!resolvedPath) {
      throw new Error("Log path could not be resolved from the Durable Run Event.");
    }
    return resolvedPath;
  };

  const ensureFile = (event: DurableRunEvent): string => {
    if (initialized && writtenPath) return writtenPath;
    const eventPath = resolvePath(event);
    mkdirSync(dirname(eventPath), { recursive: true });
    if (mode === "replace") {
      writeFileSync(eventPath, "", "utf8");
    } else {
      repairJsonlTail(eventPath, seenEventIds);
    }
    writtenPath = eventPath;
    initialized = true;
    return eventPath;
  };

  const listener: DurableRunEventLogger = ((event: DurableRunEvent) => {
    if (level === "silent") {
      return;
    }
    if (failure) {
      return;
    }

    try {
      const snapshot = redactSecrets(event) as DurableRunEvent;
      if (typeof path !== "string") {
        resolvedPath ??= path(snapshot);
      }
      const eventLevel = eventLogLevel(snapshot);
      if (!shouldWriteEvent(eventLevel, level)) {
        return;
      }
      const record = createDurableRunEventLogFields(snapshot, level === "debug");
      const eventPath = ensureFile(snapshot);
      if (seenEventIds.has(snapshot.id)) {
        return;
      }
      appendFileSync(eventPath, `${JSON.stringify({
        level: DURABLE_RUN_EVENT_LOG_LEVEL_VALUES[eventLevel],
        time: formatLocalIso(),
        ...record,
      })}\n`, "utf8");
      seenEventIds.add(snapshot.id);
    } catch (error) {
      failure ??= error;
    }
  }) as DurableRunEventLogger;

  listener.path = () => writtenPath;

  listener.flush = async () => {
    if (failure) {
      throw failure;
    }
  };

  return listener;
}

function repairJsonlTail(path: string, seenEventIds: Set<string>): void {
  if (!existsSync(path)) return;
  let content = readFileSync(path, "utf8");
  if (content.length === 0) return;

  if (!content.endsWith("\n")) {
    const lastNewline = content.lastIndexOf("\n");
    const trailing = content.slice(lastNewline + 1);
    try {
      JSON.parse(trailing);
      appendFileSync(path, "\n", "utf8");
      content += "\n";
    } catch {
      content = lastNewline >= 0 ? content.slice(0, lastNewline + 1) : "";
      truncateSync(path, Buffer.byteLength(content, "utf8"));
    }
  }

  for (const line of content.split("\n")) {
    if (line.trim().length === 0) continue;
    try {
      const record = JSON.parse(line) as { eventId?: unknown; event?: { id?: unknown } };
      if (typeof record.eventId === "string") seenEventIds.add(record.eventId);
      else if (typeof record.event?.id === "string") seenEventIds.add(record.event.id);
    } catch {
      // A malformed non-trailing line is tolerated; future writes remain valid JSONL.
    }
  }
}
