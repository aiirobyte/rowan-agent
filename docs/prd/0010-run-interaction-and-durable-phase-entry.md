# PRD: Run Interaction and Durable Phase Entry

## Status

Proposed. Implements [ADR-0012](../adr/0012-run-interaction-and-durable-phase-entry.md)
as release v0.13.0.

## Requirements

### R1 — Rename to Run Interaction

- Rename every public `PhaseInteraction*` / `ToolCallInteraction*` type and
  export as listed in ADR-0012 D1. No deprecated aliases are kept.
- `RunInteraction` carries `phase` and an optional `toolCallId`. Remove
  `PhaseInteractionOrigin` and the `origin` field (ADR-0012 D1).
- Update CONTEXT.md:
  - **Run Interaction** replaces **Phase Interaction**, **Tool Call
    Interaction**, and **Input Request**, which move under _Avoid_;
  - **Run Interaction Driver** replaces **Phase Interaction Driver**.
- Supersede the vocabulary in ADR-0010 and ADR-0011 with a note that points to
  ADR-0012.

### R2 — One answer path

- Remove `InputRequest`, `InputRequestId`, `InputRequiredCommit`, and
  `run.respond` / `runtime.respond`.
- A Phase's `user_input` request is a Run Interaction answered by
  `respondInteraction`. Its answer is `{ text, images? }`. A `user_input`
  answer of any other shape is refused. Other kinds keep opaque JSON answers.
- A store migration turns each open Input Request into a pending `user_input`
  Run Interaction with the same id, prompt, and Phase. The Run stays
  `input_required` across the upgrade.

### R3 — Tools raise Run Interactions

- `ToolInvocationContext.interaction: RunInteractionDriver`.
- `request` + `suspend` inside `execute` suspends the Tool call durably. The
  Run enters `input_required`. On `respondInteraction` the call re-executes
  with `interaction.answers()` holding the answer. The rules for cancellation
  and for multiple Tool calls in one turn are those of ADR-0011.

### R4 — Durable Phase entry

- A durable run event `phase_entered { runId, executionId, phaseId, visit }` is
  committed whenever the route enters a Phase, including the entry Phase and
  repeated visits.
- `RunSnapshot.currentPhaseId` is the last entered Phase.

## Tests

- Rename: the type-level export surface test, updated.
- Migration: an open Input Request in a v0.12 store resumes as a pending
  `user_input` Run Interaction and is answered with `respondInteraction`.
- A Tool that requests and suspends: the Run enters `input_required`, and
  after the answer the Tool re-executes and reads it. Cancelling while it is
  pending never executes the Tool.
- `phase_entered` order across a Run that routes a → b → a, and `currentPhaseId`
  after rehydration.

## Out of scope

- Any host UI or policy. Payload schemas stay opaque.
