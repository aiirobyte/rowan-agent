import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import pino from "pino";
import type { AgentEvent, AgentEventListener } from "@rowan-agent/agent";
import { redactSecrets } from "./redact";

export type AgentEventLogPath = string | ((event: AgentEvent) => string | undefined);

export type AgentEventLoggerOptions = {
  mode?: "replace" | "append";
  level?: "debug" | "info" | "warn" | "error";
};

export type AgentEventLogger = AgentEventListener & {
  path(): string | undefined;
  flush(): Promise<void>;
};

type PinoDestination = ReturnType<typeof pino.destination>;

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

function createRecord(event: AgentEvent): Record<string, unknown> {
  const sessionId = eventSessionId(event);
  const taskId = eventTaskId(event);
  const phase = eventPhase(event);
  return {
    eventType: event.type,
    eventTs: event.ts,
    ...(sessionId ? { sessionId } : {}),
    ...(taskId ? { taskId } : {}),
    ...(phase ? { phase } : {}),
    event,
  };
}

export function pinoAgentEventLogger(
  path: AgentEventLogPath,
  options: AgentEventLoggerOptions = {},
): AgentEventLogger {
  const mode = options.mode ?? "replace";
  const level = options.level ?? "info";
  let resolvedPath = typeof path === "string" ? path : undefined;
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
    logger = pino({ level }, destination);
    return logger;
  };

  const listener: AgentEventLogger = ((event: AgentEvent) => {
    if (failure) {
      return;
    }

    try {
      const snapshot = redactSecrets(event) as AgentEvent;
      ensureLogger(snapshot).info(createRecord(snapshot), "agent event");
    } catch (error) {
      failure ??= error;
    }
  }) as AgentEventLogger;

  listener.path = () => resolvedPath;

  listener.flush = async () => {
    destination?.flushSync();
    if (failure) {
      throw failure;
    }
  };

  return listener;
}
