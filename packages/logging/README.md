# @rowan-agent/logging

## Main Features

`@rowan-agent/logging` converts Rowan `AgentEvent` values into observable log records. It supports console JSONL output, Pino file logs, log-level filtering, and basic secret redaction.

Log levels are `debug`, `info`, `warn`, `error`, and `silent`. The default `info` level writes event summaries only, while `debug` includes full redacted event payloads.

## Architecture

`src/record.ts` maps events to log levels and converts them into standard fields such as `eventType`, `eventTs`, `sessionId`, `taskId`, and `phase`.

`src/redact.ts` redacts common API key and environment-variable secret patterns before records are written.

`src/console.ts` creates `consoleAgentEventLogger`, which writes JSONL records to any stream.

`src/pino.ts` creates `pinoAgentEventLogger`, which writes JSONL files and supports either a fixed path or a path resolved from the first event.

## Usage Flow

1. Choose a console logger or pino logger for the target output.
2. Register the logger as an `Agent.subscribe` listener.
3. Run the agent.
4. After the run, call `agent.flushEvents()` or the logger's own `flush()` to finish async writes and surface logging errors.

```ts
import { pinoAgentEventLogger } from "@rowan-agent/logging";

const logger = pinoAgentEventLogger("runs/session.jsonl", {
  level: "info",
});

agent.subscribe(logger);
await agent.prompt("hello");
await logger.flush();
```
