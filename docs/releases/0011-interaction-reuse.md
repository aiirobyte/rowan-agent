# Rowan Agent 0.12.1 — a new ask never reuses a closed interaction

## Fix

A Phase that requested an interaction reused any earlier request with the same kind, prompt and payload. When a model retried a tool call whose earlier permission ask had been cancelled or expired, the retry picked up the closed request and the Run failed with `Cannot suspend without pending Phase interactions.` The same matching let an earlier call's one-time approval stand in for a later identical call.

A stored request is now reused only while it is still open (pending or answered) and, for tool-call interactions, only by the same tool call — the re-entry after a resume. Any other ask creates a new request.

## Packages

- `@rowan-agent/agent` 0.12.1

## Compatibility

No API change.
