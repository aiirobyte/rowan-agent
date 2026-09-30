# Rowan Agent 0.13.1 — `ToolCallContext`

`ToolInvocationContext` is now `ToolCallContext & { interaction }`, and `ToolCallContext` is exported. Hosts that describe a Tool call before it runs, such as building a confirmation, only have the call identity and cannot ask or suspend. They can type against `ToolCallContext` instead of building a stand-in `interaction`.

Additive; `ToolInvocationContext` is structurally unchanged.

## Packages

- `@rowan-agent/agent` 0.13.1
- `@rowan-agent/models` 0.7.0 (unchanged)
- `@rowan-agent/cli` 0.7.0 (unchanged)
- `@rowan-agent/logging` 0.6.3 (unchanged)
