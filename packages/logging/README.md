# @rowan-agent/logging

Converts `AgentEvent` values into structured JSONL log records. Provides console (stderr) and file (Pino) loggers with level-based filtering and automatic secret redaction.

## Installation

```bash
bun add @rowan-agent/logging
```

## Quick Start

```ts
import { consoleAgentEventLogger, pinoAgentEventLogger } from "@rowan-agent/logging";

const consoleLog = consoleAgentEventLogger({ level: "info" });
agent.subscribe(consoleLog);

const fileLog = pinoAgentEventLogger("runs/session.jsonl", { level: "debug" });
agent.subscribe(fileLog);

await (await agent.send("summarize this workspace")).result();
await fileLog.flush();
```

## Console Logger

Writes redacted, level-filtered JSONL records to any writable stream (defaults to `process.stderr`). Useful for real-time CLI output.

```ts
import { consoleAgentEventLogger } from "@rowan-agent/logging";

const logger = consoleAgentEventLogger({
  level: "info",          // "debug" | "info" | "warn" | "error" | "silent"
  stream: process.stderr, // any { write(chunk: string) }
});
agent.subscribe(logger);
await logger.flush();
```

- `silent` disables all output.
- `debug` includes the full redacted event payload in each record.
- On write error, all subsequent events are silently dropped.

## Pino File Logger

Writes JSONL records to files via Pino with lazy initialization. Supports static paths or dynamic path resolution from each event.

```ts
import { pinoAgentEventLogger } from "@rowan-agent/logging";

// Static path
const logger = pinoAgentEventLogger("runs/session.jsonl", { level: "info", mode: "replace" });

// Dynamic path — resolved from first event
const logger = pinoAgentEventLogger(
  (event) => `runs/${event.sessionId}.jsonl`,
  { level: "debug" },
);

agent.subscribe(logger);
await logger.flush();
logger.path(); // resolved file path (available after first event)
```

- `mode: "replace"` (default) truncates on creation; `"append"` appends.
- Directory created recursively.

## Log Levels

```ts
type AgentEventLogLevel = "debug" | "info" | "warn" | "error" | "silent";
```

The configured level is a minimum threshold — `info` writes `info` + `warn` + `error` but suppresses `debug`.

| `event.type` | Mapped Level |
|---|---|
| `message_update`, `tool_execution_update` | debug |
| `tool_execution_end` (when `isError`) | warn |
| All others | info |

## Secret Redaction

All loggers automatically redact sensitive patterns before writing:

- OpenAI-style keys: `sk-<12+ chars>` → `[REDACTED]`
- Env var patterns: `OPENAI_API_KEY=...`, `ANTHROPIC_API_KEY=...`, `GEMINI_API_KEY=...` → value replaced

```ts
import { redactSecrets } from "@rowan-agent/logging";
const safe = redactSecrets(event);
```

## Log Record Format

Each record is a single JSON line with Pino-compatible fields:

```json
{
  "level": 30,
  "time": "2026-06-21T14:30:45.120+08:00",
  "eventType": "phase_start",
  "eventTs": "2026-06-21T14:30:45.120+08:00",
  "sessionId": "ses_abc123",
  "phase": "execute",
  "event": { ... }
}
```

| Field | Always | Notes |
|-------|--------|-------|
| `level` | Yes | Pino numeric level (20/30/40/50) |
| `time` | Yes | Local ISO-8601 with timezone offset |
| `eventType` | Yes | `AgentEvent.type` |
| `sessionId` | When available | From event payload |
| `event` | Debug only | Full redacted event payload |

## AgentEvent Types

| Event | Description |
|-------|-------------|
| `agent_start` / `agent_end` | Agent run lifecycle |
| `turn_start` / `turn_end` | Agent turn (includes outcome) |
| `model_requested` | LLM request sent |
| `phase_start` / `phase_end` | Phase execution lifecycle |
| `message_start` / `message_update` / `message_end` | Model message streaming |
| `tool_execution_start` / `tool_execution_update` / `tool_execution_end` | Tool call lifecycle |

## Source Structure

```
src/
├── record.ts     # Event-to-level mapping, log record construction
├── redact.ts     # Secret pattern redaction
├── console.ts    # Console logger (JSONL to any stream)
└── pino.ts       # Pino file logger
```

## Version

Current version: **0.6.0**
