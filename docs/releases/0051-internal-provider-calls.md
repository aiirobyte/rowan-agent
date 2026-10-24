# Rowan Agent 0.38.0 - Providers can distinguish internal model calls

`ProviderCallContext` now marks model calls that work on a copy of the conversation, so providers with their own conversation state can avoid advancing it for internal work.

- **Internal calls**: `runInternalModelLoop` and the core Phases set `internal: true` on the Provider context. Their messages are not written to History.
- **Conversation calls**: ordinary model calls omit `internal`, preserving their meaning as normal conversation turns.
- **Session affinity**: `request.sessionId` is unchanged for internal calls, so HTTP providers keep prompt-cache affinity.

## Packages

- `@rowan-agent/agent` 0.38.0
- `@rowan-agent/models` 0.13.0
