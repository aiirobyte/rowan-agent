# Rowan Agent 0.19.2 — provider-initiated tool interactions and live interaction events

This release fixes an issue where host tools called mid-stream by a model Provider via `ProviderCallContext.tools.call` (`ctx.tools.call`) failed when requesting interactions, and introduces transient `live_interaction` events for host visibility.

## In-place provider tool interactions

Previously, when a Provider invoked a host tool mid-stream and either the tool's `before_tool_call` hook (e.g. a host permission check) or the tool's `execute` method requested a Run interaction, the driver raised a `RunInteractionBoundary`. Because boundaries were intended to suspend Runs between model turns, the boundary escaped as an uncaught error (`"Run interactions require host input."`), preventing the host from answering. The unhandled boundary also left a suspension checkpoint on the driver, causing subsequent tool calls in the same execution attempt to reuse the previous tool call ID and fail with an idempotency payload conflict.

In this release:

- **In-place wait and re-execution**: When a provider-initiated tool call raises a `RunInteractionBoundary`, the runtime awaits answers in place using its in-memory live interaction mechanism. Once answered via `run.respondInteraction`, answers are fed back into driver state and the same tool call re-executes with its answer.
- **Idempotent tool start**: Tool reservation and start in the durable store are idempotent across in-place re-executions within the same attempt, avoiding duplicate records or idempotency payload conflicts.
- **Decline handling**: If an interaction is declined (`cancel: true`), the tool call ends in a failed state and returns `{ ok: false }` to the provider, allowing the Run to continue.
- **Clean cancellation**: If the Run is cancelled while waiting on an interaction, the in-flight tool call transitions to a terminal failed state with no tool call left `in_progress`.
- **Subsequent calls**: After a provider tool call resolves or fails, driver checkpoints are cleared so subsequent tool calls receive their own tool call records cleanly.

## Live interaction events

Hosts observing runs via `run.observe()` can now detect live interactions in real time:

- **Event shape**:
  ```ts
  export type LiveInteractionEvent = Readonly<{
    kind: "live_interaction";
    durability: "transient";
    runId: RunId;
    executionId?: ExecutionId;
    interaction: RunInteraction;
  }>;
  ```
- **Lifecycle transitions**: Published when a live interaction opens (`status: "pending"`), when it is answered (`status: "answered"` with `answer`), and when it is cancelled (`status: "cancelled"`).
- **Public types**: `LiveInteractionEvent` and `RunInteraction` are exported from `@rowan-agent/agent` and included in the `RunEvent` and `TransientRunEvent` unions.

## Packages

- `@rowan-agent/agent` 0.19.2
- Other package versions unchanged
