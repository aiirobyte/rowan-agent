# @rowan-agent/logging

Writes `DurableRunEvent` values as redacted structured JSONL, with stderr
Console and Pino file loggers.

```ts
import {
  consoleDurableRunEventLogger,
  pinoDurableRunEventLogger,
} from "@rowan-agent/logging";

const consoleLog = consoleDurableRunEventLogger({ level: "info" });
const fileLog = pinoDurableRunEventLogger("runs/run.jsonl", { level: "debug" });

for await (const event of run.observe()) {
  consoleLog(event);
  fileLog(event);
}
await fileLog.flush();
```

`debug` includes the complete redacted event payload; `info`, `warn`, and
`error` act as minimum-level filters. The logger recursively hides keys
containing token, secret, password, apiKey, and authorization, and also handles
common API key text patterns.

The file logger supports `mode: "replace" | "append"` and static paths. A
resolver function can also derive the path from the first event.

Durable event types are `message_committed`, `run_transitioned`, and
`tool_state_changed`.
