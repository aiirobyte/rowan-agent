---
status: accepted
---

# Tool-Call Interactions and Hook Execution Context

Rowan adds execution identity and run metadata to tool hook events, and enables `before_tool_call` extension hooks to request typed, suspendable interactions (e.g. permissions and confirmations) that pause the Run in `input_required` and resume on host input using the existing ADR-0010 `PhaseInteraction` machinery.

## Context

Mori (the primary consumer of Rowan) is building a host permission system: before a Tool executes, a host policy decides whether to allow, deny, or ask the user. For "ask", the Run must pause, surface a typed permission interaction to the user, and resume when answered.

Previously, Rowan could not support this upstream:
1. `BeforeToolCallEvent` and `AfterToolCallEvent` in `@rowan-agent/agent` only carried `{ tool, args }` (and `result` on after). Although the runtime had `context.agentId/runId/toolCallId` internally, it was not passed to extension hooks. Mori had to monkey-patch `AgentRuntime.execute` using `AsyncLocalStorage` and read private runtime state to correlate tool calls to Runs.
2. `BeforeToolCallResult` was limited to `{ allow, reason }`. While Phases could suspend into `input_required` using `PhaseInteractionDriver` (ADR-0010), tools had no suspension mechanism.

## Decision

### Add execution identity to tool hooks

`BeforeToolCallEvent` and `AfterToolCallEvent` are extended with additive, read-only execution fields:
- `runId`: The ID of the executing Run.
- `agentId`: The ID of the Agent.
- `toolCallId`: The durable Rowan Tool Call ID.
- `metadata`: The Run's read-only host metadata record (`Record<string, unknown>`).

Additionally, `BeforeToolCallEvent` includes `answer?: unknown`, which is populated when re-entering the hook after an interaction has been resolved.

### Re-use ADR-0010 `PhaseInteraction` machinery for tool suspension

Rather than introducing a parallel mechanism, tool-call suspension directly reuses the ADR-0010 `PhaseInteraction` model:
- A `before_tool_call` hook can return:
  ```ts
  {
    interaction: {
      kind: "permission" | "confirmation" | "user_input" | "elicitation";
      prompt: string;
      payload?: JsonValue;
    }
  }
  ```
- The runtime passes the active `PhaseInteractionDriver` into the tool execution seam. When an interaction is requested, the driver records a pending `PhaseInteraction` and suspends the execution attempt with a JSON-safe checkpoint (`tool_call_suspension`).
- The Run transitions to `input_required` with `run.interactions` listing the pending interaction, queryable via the standard `run.snapshot()` and resolvable via `run.respondInteraction({ interactionId, input })`.

### Re-entry and execution contract

- **Pending durability**: Because the tool has not yet executed when the interaction is requested, the suspension state is durable and survives process restart / runtime rehydration.
- **Resume re-entry**: When `respondInteraction` is called, a new execution attempt re-enters the tool execution. The runtime restores the pending tool calls from the checkpoint and invokes `before_tool_call` again, passing the user's input as `event.answer`.
- **Verdict decision**: The host hook decides the verdict based on `event.answer`:
  - `{ allow: true }`: The tool handler executes with the original arguments.
  - `{ allow: false, reason }`: The tool call is recorded as a failed tool result (`ok: false`) containing the denial reason, without executing the tool handler.
- **Multiple tool calls in one turn**: When an assistant turn produces multiple tool calls and one or more request interaction, tool calls suspend sequentially per call. Approved tools execute and record their results, while subsequent tools suspend in order.
- **Cancellation**: Cancelling or stopping a Run while a tool-call interaction is pending behaves identically to a pending Phase interaction: the Run transitions to `cancelled`, and the tool handler never executes.

### Backwards compatibility

Existing hooks returning `{ allow: true }` or `{ allow: false, reason: string }` continue to function without changes. When no interaction is requested, execution proceeds immediately and synchronously without entering `input_required`.

## Consequences

- Host applications like Mori can implement permission policies and approval gates natively through extension hooks without runtime monkey-patching or `AsyncLocalStorage`.
- Tool interactions reuse the same `PhaseInteraction` lifecycle, storage, events, and `respondInteraction` API introduced in ADR-0010.
- Public interface is strictly additive.
