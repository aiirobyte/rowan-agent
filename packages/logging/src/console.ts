import type { AgentEvent, AgentEventListener } from "@rowan-agent/models";
import {
  AGENT_EVENT_LOG_LEVEL_VALUES,
  createAgentEventLogFields,
  eventLogLevel,
  formatLocalIso,
  isMessageStreamUpdate,
  shouldWriteEvent,
  type AgentEventLogLevel,
} from "./record";
import { redactSecrets } from "./redact";

export type ConsoleAgentEventLogStream = {
  write(chunk: string): unknown;
};

export type ConsoleAgentEventLoggerOptions = {
  level?: AgentEventLogLevel;
  stream?: ConsoleAgentEventLogStream;
};

export type ConsoleAgentEventLogger = AgentEventListener & {
  flush(): Promise<void>;
};

export function consoleAgentEventLogger(
  options: ConsoleAgentEventLoggerOptions = {},
): ConsoleAgentEventLogger {
  const level = options.level ?? "info";
  const stream = options.stream ?? process.stderr;
  let failure: unknown;

  const listener: ConsoleAgentEventLogger = ((event: AgentEvent) => {
    if (level === "silent") {
      return;
    }
    if (failure) {
      return;
    }

    try {
      const snapshot = redactSecrets(event) as AgentEvent;
      if (isMessageStreamUpdate(snapshot)) {
        return;
      }
      const eventLevel = eventLogLevel(snapshot);
      if (!shouldWriteEvent(eventLevel, level)) {
        return;
      }
      const record = {
        level: AGENT_EVENT_LOG_LEVEL_VALUES[eventLevel],
        time: formatLocalIso(),
        ...createAgentEventLogFields(snapshot, level === "debug"),
      };
      stream.write(`${JSON.stringify(record)}\n`);
    } catch (error) {
      failure ??= error;
    }
  }) as ConsoleAgentEventLogger;

  listener.flush = async () => {
    if (failure) {
      throw failure;
    }
  };

  return listener;
}
