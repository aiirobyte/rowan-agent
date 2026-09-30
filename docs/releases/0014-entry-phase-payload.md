# Rowan Agent 0.13.2 — Entry Phase Payload

`AgentRuntime.start()` accepts an optional JSON `phasePayload`. Rowan validates it against the entry Phase input definition before creating a Run, fills omitted fields from declared defaults, then sends it through the same durable Phase input message and `phase_entered` event path used by routed Phase entry.

The effective Payload is stored with the Run and survives Runtime restart, including while the entry Phase is suspended. Omitting `phasePayload` preserves the existing behavior. The prior Run metadata `phasePayload` fallback remains available for compatibility.

**Default choice:** omitted fields use the entry Phase's declared defaults, matching routed Payload semantics.

## Packages

- `@rowan-agent/agent` 0.13.2
- Other package versions unchanged
