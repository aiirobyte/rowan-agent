# @rowan-agent/logging

## Overview

`@rowan-agent/logging` converts Rowan `AgentEvent` values into observable log records. It supports console JSONL output, Pino file logs, log-level filtering, and automatic secret redaction.

## Features

- **JSONL Output** — structured log records for easy parsing
- **Pino Integration** — high-performance file logging with Pino
- **Log Levels** — `debug`, `info`, `warn`, `error`, `silent`
- **Secret Redaction** — automatic redaction of API keys and sensitive patterns
- **Dual Output** — console (stderr) and file logging simultaneously

## Architecture

```
src/
├── index.ts      # Package entry point
├── record.ts     # Event-to-log-record mapping with level assignment
├── redact.ts     # Secret pattern redaction (API keys, env vars)
├── console.ts    # Console logger (writes JSONL to any stream)
└── pino.ts       # Pino logger (writes JSONL files)
```

### Log Level Behavior

| Level | Records |
|-------|---------|
| `debug` | Full redacted event payloads |
| `info` | Event summaries only (default) |
| `warn` | Warnings and errors |
| `error` | Errors only |
| `silent` | No output |

## Installation

```bash
npm install @rowan-agent/logging
# or
bun add @rowan-agent/logging
```

## Usage

### Console Logger

```ts
import { consoleAgentEventLogger } from "@rowan-agent/logging";

const logger = consoleAgentEventLogger(process.stderr, {
  level: "info",
});

agent.subscribe(logger);
await agent.run();
```

### Pino File Logger

```ts
import { pinoAgentEventLogger } from "@rowan-agent/logging";

const logger = pinoAgentEventLogger("runs/session.jsonl", {
  level: "debug", // Include full redacted payloads
});

agent.subscribe(logger);
await agent.run();

// Ensure all logs are flushed
await logger.flush();
```

### Auto-Resolved Log Path

```ts
import { pinoAgentEventLogger } from "@rowan-agent/logging";

// Path resolves from the first event's timestamp
const logger = pinoAgentEventLogger(undefined, { level: "info" });

agent.subscribe(logger);
await agent.run();
await logger.flush();
```

### Complete Example

```ts
import { Agent, createMessage } from "@rowan-agent/agent";
import { pinoAgentEventLogger } from "@rowan-agent/logging";

const agent = new Agent({ /* config */ });
const logger = pinoAgentEventLogger("runs/agent.jsonl", {
  level: "info",
});

agent.subscribe(logger);

await agent.run({
  context: {
    ...agent.state.context,
    messages: [
      ...agent.state.context.messages,
      createMessage("user", "hello"),
    ],
  },
});

await logger.flush();
```

## Log Record Format

Each log record is a JSON object with these fields:

```json
{
  "level": 30,
  "time": 1777791428515,
  "eventType": "session_created",
  "sessionId": "ses_12345678",
  "eventTs": "2026-05-03T14:57:08.515+08:00"
}
```

### Common Event Types

| Event | Description |
|-------|-------------|
| `session_created` | New session started |
| `turn_started` | Agent turn began |
| `turn_completed` | Agent turn finished |
| `tool_call` | Tool execution started |
| `tool_result` | Tool execution completed |
| `error` | Error occurred |

## Version

Current version: **0.4.4**
