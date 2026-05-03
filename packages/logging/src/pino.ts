import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import pino from "pino";
import type { AgentEvent, AgentEventListener } from "@rowan-agent/agent";
import { redactSecrets } from "./redact";

export type AgentEventLogPath = string | ((event: AgentEvent) => string | undefined);
export type AgentEventLogLevel = "debug" | "info" | "warn" | "error" | "silent";

export type AgentEventLoggerOptions = {
  mode?: "replace" | "append";
  level?: AgentEventLogLevel;
};

export type AgentEventLogger = AgentEventListener & {
  path(): string | undefined;
  flush(): Promise<void>;
};

type PinoDestination = ReturnType<typeof pino.destination>;
type WritableAgentEventLogLevel = Exclude<AgentEventLogLevel, "silent">;

const LOG_LEVEL_VALUES = {
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
} satisfies Record<WritableAgentEventLogLevel, number>;

function eventSessionId(event: AgentEvent): string | undefined {
  if (event.type === "session_created" || event.type === "session_loaded") {
    return event.session.parentSessionId ?? event.session.id;
  }
  if (
    event.type === "thread_created" ||
    event.type === "thread_end"
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

function eventLogLevel(event: AgentEvent): Exclude<WritableAgentEventLogLevel, "debug"> {
  if (event.type === "error") {
    return "error";
  }
  if (
    event.type === "budget_exceeded" ||
    event.type === "tool_blocked" ||
    (event.type === "tool_approval_result" && !event.decision.allow) ||
    (event.type === "verification_end" && !event.result.passed) ||
    (event.type === "outcome" && !event.outcome.passed)
  ) {
    return "warn";
  }
  return "info";
}

function shouldWriteEvent(eventLevel: WritableAgentEventLogLevel, configuredLevel: WritableAgentEventLogLevel): boolean {
  return LOG_LEVEL_VALUES[eventLevel] >= LOG_LEVEL_VALUES[configuredLevel];
}

function createRecord(event: AgentEvent, includeEventPayload: boolean): Record<string, unknown> {
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
      const record = createRecord(snapshot, level === "debug");
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
