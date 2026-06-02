import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import pino from "pino";
import type { AgentEvent, AgentEventListener } from "@rowan-agent/models";
import { redactSecrets } from "./redact";
import {
  createAgentEventLogFields,
  eventLogLevel,
  shouldWriteEvent,
  type AgentEventLogLevel,
} from "./record";

export type { AgentEventLogLevel } from "./record";

export type AgentEventLogPath = string | ((event: AgentEvent) => string | undefined);

export type AgentEventLoggerOptions = {
  mode?: "replace" | "append";
  level?: AgentEventLogLevel;
};

export type AgentEventLogger = AgentEventListener & {
  path(): string | undefined;
  flush(): Promise<void>;
};

type PinoDestination = ReturnType<typeof pino.destination>;

export function pinoAgentEventLogger(
  path: AgentEventLogPath,
  options: AgentEventLoggerOptions = {},
): AgentEventLogger {
  const mode = options.mode ?? "replace";
  const level = options.level ?? "info";
  let resolvedPath = typeof path === "string" ? path : undefined;
  let writtenPath: string | undefined;
  let destination: PinoDestination | undefined;
  let logger: pino.Logger | undefined;
  let failure: unknown;

  const resolvePath = (event: AgentEvent): string => {
    resolvedPath ??= typeof path === "string" ? path : path(event);
    if (!resolvedPath) {
      throw new Error("Log path could not be resolved from the agent event.");
    }
    return resolvedPath;
  };

  const ensureLogger = (event: AgentEvent): pino.Logger => {
    if (logger) {
      return logger;
    }

    const eventPath = resolvePath(event);
    mkdirSync(dirname(eventPath), { recursive: true });
    if (mode === "replace") {
      writeFileSync(eventPath, "", "utf8");
    }
    destination = pino.destination({ dest: eventPath, mkdir: true, sync: true });
    logger = pino({ level, base: null }, destination);
    writtenPath = eventPath;
    return logger;
  };

  const listener: AgentEventLogger = ((event: AgentEvent) => {
    if (level === "silent") {
      return;
    }
    if (failure) {
      return;
    }

    try {
      const snapshot = redactSecrets(event) as AgentEvent;
      if (typeof path !== "string") {
        resolvedPath ??= path(snapshot);
      }
      const eventLevel = eventLogLevel(snapshot);
      if (!shouldWriteEvent(eventLevel, level)) {
        return;
      }
      const record = createAgentEventLogFields(snapshot, level === "debug");
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
  }) as AgentEventLogger;

  listener.path = () => writtenPath;

  listener.flush = async () => {
    destination?.flushSync();
    if (failure) {
      throw failure;
    }
  };

  return listener;
}
