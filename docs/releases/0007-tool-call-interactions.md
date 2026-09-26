# Rowan Agent 0.10.2 — tool-call interactions and hook execution context

This release introduces execution identity on Tool extension hooks and supports typed, suspendable Tool-call interactions. A `before_tool_call` hook can now return an interaction request (such as a user permission check or confirmation) that transitions the Run to `input_required` via the ADR-0010 Phase interaction machinery. When answered via `respondInteraction`, the hook re-enters with the answer to decide allow or deny.

Status: staged and package-built locally; npm publication requires explicit authorization for the external registry mutation.

## Runtime contract

- `BeforeToolCallEvent` and `AfterToolCallEvent` include additive execution context fields:
  - `runId?: string`
  - `agentId?: string`
  - `toolCallId?: string`
  - `metadata?: Readonly<Record<string, unknown>>`
- `BeforeToolCallEvent` additionally receives `answer?: unknown`, present when re-entering after an interaction has been resolved.
- `BeforeToolCallResult` accepts `{ interaction: ToolCallInteractionRequest }`, where `ToolCallInteractionRequest` is `{ id?: string, kind: PhaseInteractionKind, prompt: string, payload?: JsonValue }`.
- Returning `{ interaction }` records a durable `PhaseInteraction` on the Run, suspends execution into `input_required`, and checkpoints the pending tool call state.
- Responding via `run.respondInteraction({ interactionId, input })` resumes the Run, re-entering `before_tool_call` with `event.answer` set to `input`.
- In assistant turns with multiple tool calls, interactive tool calls suspend sequentially per call in execution order.
- Rehydrating / restarting the runtime while an interaction is pending preserves the pending interaction state in the Durable Store.
- Cancelling or stopping a Run while pending marks the Run `cancelled` and skips tool execution.

## Compatibility

Fully additive and backwards-compatible with existing 0.10.x installations. Hooks returning legacy `{ allow: true }` or `{ allow: false, reason: string }` continue to work unchanged without suspension.
