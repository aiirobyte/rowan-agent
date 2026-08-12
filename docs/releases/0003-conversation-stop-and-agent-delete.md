# Rowan Agent 0.9.3 — interruptible Conversations and physical Agent deletion

This release adds the durable primitives required by Everyield's Conversation
stop/resume and independent Conversation deletion flow.

Status: staged and package-built locally; npm publication requires explicit
authorization for the external registry mutation.

## Runtime contract

- `AgentRuntime.cancel()` persists a visible assistant prefix as an
  `interrupted` Assistant Message when a turn is stopped.
- Completed Tool results remain durable. A running Tool remains
  `indeterminate`; its side effect is never replayed automatically.
- `AgentRuntime.deleteAgent()` requires the explicit
  `conversation-delete-v1` confirmation token and an exact `expectedRunIds`
  set. It removes the Agent, Runs, Messages, ToolCalls, Events, idempotency
  records, and operation receipts.
- SQLite event pagination filters cursors after physical deletion so deleted
  history cannot be replayed through an offset cursor.

## Compatibility

This is a runtime contract extension. Hosts that need physical Conversation
deletion must upgrade to `0.9.3` before invoking `deleteAgent`.

## Verification

The runtime suite must pass before publishing. In particular, it covers
interrupted output durability, indeterminate Tool cancellation, and complete
Agent record removal.
