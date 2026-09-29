# PRD: Run Interaction and Durable Phase Entry

## Status

Proposed. Implements [ADR-0012](../adr/0012-run-interaction-and-durable-phase-entry.md)
as release v0.13.0. The version is bumped but not published; Mori consumes it
through a local link until the owner publishes.

## Requirements

### R1 — Rename, and remove `origin`

- Rename every public `PhaseInteraction*` / `ToolCallInteraction*` export to
  `RunInteraction*` (ADR D1). Keep no aliases.
- Remove `PhaseInteractionOrigin` and `origin`. `toolCallId` marks an
  interaction raised on a Tool call.
- CONTEXT.md:
  - **Run Interaction**, **Run Interaction Driver**, and **Interaction
    Record** replace **Phase Interaction**, **Phase Interaction Driver**,
    **Tool Call Interaction**, and **Input Request**. The old names go under
    _Avoid_.
  - ADR-0010 and ADR-0011 get a note that ADR-0012 supersedes their
    vocabulary.

### R2 — Final states and one answer path

- `RunInteractionStatus` is one of `pending`, `answered`, `replied`, or
  `cancelled`.
- `respondInteraction({ interactionId, input })` sets `answered`.
  `respondInteraction({ interactionId, cancel: true })` sets `cancelled`.
- New Agent Input for an Agent whose Run is `input_required` sets every
  pending interaction of that Run to `replied`. The input is committed as a
  user message after their records, and the Run resumes.
- Cancelling a Run sets its pending interactions to `cancelled`.
- The Run resumes when no interaction is pending.
- Remove `InputRequest`, `InputRequestId`, `InputRequiredCommit`, and
  `run.respond` / `runtime.respond`.
- Upgrade: each Run left with an open v0.12 Input Request is cancelled with
  the reason "Input Request retired in v0.13".

### R3 — Interaction Records and result templates

- A request may carry `result?: { answered?, replied?, cancelled? }`. These are
  template strings with the placeholders `{{prompt}}`, `{{answer}}` (the answer
  as compact JSON, or the string itself), and `{{reply}}` (the text of the
  replying input). They are stored durably with the interaction.
- On a final state, Rowan commits one Interaction Record to the transcript
  and never commits a user message for an answer. Remove the current
  "Phase-origin answer becomes a user message" path.
- Model projection:
  - a record without `toolCallId` becomes one model message, rendered from its
    template or the Rowan default for its kind and state;
  - a record with `toolCallId` is folded into that Tool call's result text and
    is never a separate message.
- Default templates cover every kind × state, for example:
  - `permission`/`cancelled`: "The user did not grant permission: {{prompt}}";
  - `user_input`/`answered`: "The user answered \"{{prompt}}\": {{answer}}".

### R4 — Tools raise Run Interactions

- `ToolInvocationContext.interaction: RunInteractionDriver`, with the direct
  Phase contract including the checkpoint.
- A suspended Tool call:
  - moves the Run to `input_required`;
  - re-executes on resume with answers and checkpoint;
  - never executes if cancelled.
- Several Tool calls in one turn follow the ADR-0011 rules.

### R5 — Durable Phase entry

- The durable event `phase_entered { runId, executionId, phaseId, visit }` is
  committed on every Phase entry.
- `RunSnapshot.currentPhaseId` holds the last entered Phase and survives
  rehydration.

## Tests

- Answer / cancel / reply:
  - one of two interactions answered keeps the Run waiting;
  - cancelling the second resumes it;
  - new Agent Input marks all pending ones `replied`, commits the user message
    after the records, and resumes.
- Records: an answered card commits a record and no user message; the
  projection renders the declared template, or the default when there is none.
- Tool fold: a permission record with `toolCallId` appears inside that Tool
  result in the provider request. The tool_use → tool_result adjacency holds.
- A Tool that requests and suspends in `execute`:
  - it resumes with the answer and its checkpoint;
  - cancelling it never executes the Tool.
- Upgrade: a v0.12 store with an open Input Request comes up with that Run
  cancelled and the stated reason.
- `phase_entered` order for a → b → a, and `currentPhaseId` after
  rehydration.

## Out of scope

- Host UI and policy. Answer payload schemas stay opaque to Rowan.
- Publishing to npm.
