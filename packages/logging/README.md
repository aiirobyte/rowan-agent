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
  if (event.durability === "durable") {
    consoleLog(event);
    fileLog(event);
  }
}
await fileLog.flush();
```

`run.observe()` yields the broader `RunEvent` union. Logging intentionally
narrows it to `DurableRunEvent`; transient `message_delta` and `tool_progress`
events are live presentation data and are never written to the durable log.

`debug` includes the complete redacted event payload; `info`, `warn`, and
`error` act as minimum-level filters. The logger recursively hides keys
containing token, secret, password, apiKey, and authorization, and also handles
common API key text patterns.

The file logger supports `mode: "replace" | "append"` and static paths. A
resolver function can also derive the path from the first event.

`runtime.consume()` already yields only Durable Run Events. Their types are
`message_committed`, `run_transitioned`, and `tool_state_changed`.
