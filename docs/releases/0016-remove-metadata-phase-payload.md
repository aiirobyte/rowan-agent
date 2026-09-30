# Rowan Agent 0.14.0 — Run metadata `phasePayload` removed

**Breaking.** A `phasePayload` key inside Run `metadata` is no longer read as the entry Phase Payload. Pass it as `AgentRuntime.start(agentId, input, { phasePayload })` instead: Rowan validates it against the entry Phase input, fills declared defaults, stores it once with the Run, and returns it as `RunSnapshot.phasePayload`.

Hosts that still write `metadata.phasePayload` see the entry Phase's declared defaults, not their value. Existing Runs are unaffected once started; only Runs created without the native option relied on the fallback.

## Packages

- `@rowan-agent/agent` 0.14.0
- Other package versions unchanged
