import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import pino from "pino";
import type { DurableRunEvent } from "@rowan-agent/agent";
import { redactSecrets } from "./redact";
import {
  createDurableRunEventLogFields,
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

type PinoDestination = ReturnType<typeof pino.destination>;

export function pinoDurableRunEventLogger(
  path: DurableRunEventLogPath,
  options: DurableRunEventLoggerOptions = {},
): DurableRunEventLogger {
  const mode = options.mode ?? "replace";
  const level = options.level ?? "info";
  let resolvedPath = typeof path === "string" ? path : undefined;
  let writtenPath: string | undefined;
  let destination: PinoDestination | undefined;
  let logger: pino.Logger | undefined;
  let failure: unknown;

  const resolvePath = (event: DurableRunEvent): string => {
    resolvedPath ??= typeof path === "string" ? path : path(event);
    if (!resolvedPath) {
      throw new Error("Log path could not be resolved from the Durable Run Event.");
    }
    return resolvedPath;
  };

  const ensureLogger = (event: DurableRunEvent): pino.Logger => {
    if (logger) {
      return logger;
    }

    const eventPath = resolvePath(event);
    mkdirSync(dirname(eventPath), { recursive: true });
    if (mode === "replace") {
      writeFileSync(eventPath, "", "utf8");
    }
    destination = pino.destination({ dest: eventPath, mkdir: true, sync: true });
    logger = pino({
      level,
      base: null,
      timestamp: () => `,"time":"${formatLocalIso()}"`,
    }, destination);
    writtenPath = eventPath;
    return logger;
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
      const eventLogger = ensureLogger(snapshot);
      if (eventLevel === "error") {
        eventLogger.error(record);
      } else if (eventLevel === "warn") {
        eventLogger.warn(record);
      } else {
        eventLogger.info(record);
      }
    } catch (error) {
      failure ??= error;
    }
  }) as DurableRunEventLogger;

  listener.path = () => writtenPath;

  listener.flush = async () => {
    destination?.flushSync();
    if (failure) {
      throw failure;
    }
  };

  return listener;
}
