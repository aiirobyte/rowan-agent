import type { DurableRunEvent } from "@rowan-agent/agent";
import {
  DURABLE_RUN_EVENT_LOG_LEVEL_VALUES,
  createDurableRunEventLogFields,
  eventLogLevel,
  formatLocalIso,
  shouldWriteEvent,
  type DurableRunEventLogLevel,
} from "./record";
import { redactSecrets } from "./redact";

export type ConsoleDurableRunEventLogStream = {
  write(chunk: string): unknown;
};

export type ConsoleDurableRunEventLoggerOptions = {
  level?: DurableRunEventLogLevel;
  stream?: ConsoleDurableRunEventLogStream;
};

export type ConsoleDurableRunEventLogger = ((event: DurableRunEvent) => void) & {
  flush(): Promise<void>;
};

export function consoleDurableRunEventLogger(
  options: ConsoleDurableRunEventLoggerOptions = {},
): ConsoleDurableRunEventLogger {
  const level = options.level ?? "info";
  const stream = options.stream ?? process.stderr;
  let failure: unknown;

  const listener: ConsoleDurableRunEventLogger = ((event: DurableRunEvent) => {
    if (level === "silent") {
      return;
    }
    if (failure) {
      return;
    }

    try {
      const snapshot = redactSecrets(event) as DurableRunEvent;
      const eventLevel = eventLogLevel(snapshot);
      if (!shouldWriteEvent(eventLevel, level)) {
        return;
      }
      const record = {
        level: DURABLE_RUN_EVENT_LOG_LEVEL_VALUES[eventLevel],
        time: formatLocalIso(),
        ...createDurableRunEventLogFields(snapshot, level === "debug"),
      };
      stream.write(`${JSON.stringify(record)}\n`);
    } catch (error) {
      failure ??= error;
    }
  }) as ConsoleDurableRunEventLogger;

  listener.flush = async () => {
    if (failure) {
      throw failure;
    }
  };

  return listener;
}
