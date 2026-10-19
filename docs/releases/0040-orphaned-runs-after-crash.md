# Rowan Agent 0.35.1 — Orphaned Runs are interrupted on every owner takeover

A host killed while a Run was `running` left that Run `running` forever after restart:

- The SQLite store interrupted the previous owner's Runs before attaching its change recorder, so the interruption lived only in memory and the table still said `running`.
- After an intermediate open and release, the next open skipped interruption because the owner row was empty.

Now every owner open interrupts each `running` Run whose execution epoch is at or below the previous epoch, and persists it (`failed` with `runtime_interrupted`, or `tool_indeterminate` when a Tool was in flight). Existing stores are repaired on the next open.

## Packages

- `@rowan-agent/agent` 0.35.1
