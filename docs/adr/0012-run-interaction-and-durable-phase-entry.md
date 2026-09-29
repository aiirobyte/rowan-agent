---
status: proposed
---

# Run Interaction and Durable Phase Entry

Rowan has one interaction model under three names, and two answer paths:

- the ADR-0010 Phase Interaction;
- the ADR-0011 Tool Call Interaction, which reuses it;
- the legacy Input Request, with its own `respond({ requestId })`.

Phase progress is only transient. This ADR makes the interaction a Run-level
concept with one answer path. It lets a Tool raise an interaction while it
executes, and it records Phase entry durably.

## Context

- A `PhaseInteraction` already belongs to the Run. The Run is what enters
  `input_required`, lists `run.interactions`, and resolves them through
  `run.respondInteraction`. The `phase` field only says where it was raised.
- ADR-0011 routes `before_tool_call` interactions through the same driver, and
  `ToolCallInteractionKind` is an alias of `PhaseInteractionKind`. "Phase" in
  the name is therefore already inaccurate.
- The Input Request (CONTEXT.md: "a legacy `user_input` Phase Interaction
  projection") keeps a second answer API, `run.respond({ requestId, input })`.
  Mori still uses it in two places, so a host has two ways to answer the same
  kind of request.
- A Tool's `execute` gets `ToolInvocationContext` with no interaction driver.
  Only a hook can ask the user something, so an "ask the user" Tool cannot be
  written.
- `phase_status` is a transient `RunEvent`. A host that restarts or subscribes
  late cannot know which Phase a Run is in without inferring it.

## Decision

1. **Run Interaction.** Rename the model and every public type (breaking,
   v0.13.0, no aliases):
   - `PhaseInteraction` → `RunInteraction`;
   - `PhaseInteractionKind` / `Status` / `Origin` / `State` →
     `RunInteractionKind` / `Status` / `Origin` / `State`;
   - `PhaseInteractionDriver` → `RunInteractionDriver`;
   - `PhaseInteractionBoundary` / `CancelledError` → `RunInteractionBoundary` /
     `CancelledError`;
   - `ToolCallInteractionRequest` / `Kind` → the `RunInteraction` request.

   A Run Interaction records where it was raised with two fields. `phase` is
   always present. `toolCallId` is present when it was raised on a Tool call,
   either by a `before_tool_call` hook or by the Tool's own `execute`. The
   redundant `PhaseInteractionOrigin` (`"phase" | "tool_call"`) is removed,
   because `toolCallId` already carries that fact.
2. **One answer path, two answer forms.** Remove the Input Request and
   `run.respond`. Every Interaction is answered by `run.respondInteraction`.
   - A **text** Interaction is `kind: "user_input"`. Its answer is
     `{ text: string; images?: UserInput images }`, the content `run.respond`
     used to take.
   - A **structured** Interaction (`permission`, `confirmation`,
     `elicitation`) takes a JSON answer whose schema stays opaque to Rowan. The durable store migrates an open Input Request
   into a pending `user_input` Run Interaction with the same id.
3. **Tools raise Run Interactions.** `ToolInvocationContext` gains
   `interaction: RunInteractionDriver`, with the same `request` / `answers` /
   `suspend` contract a direct Phase has (ADR-0010). A suspended Tool call
   re-executes on resume with its answers available, which is the ADR-0011
   re-entry rule applied to `execute`.
4. **Durable Phase entry.** A new durable run event, `phase_entered`
   (`runId`, `executionId`, `phaseId`, `visit`), is committed each time the
   route enters a Phase. `RunSnapshot` gains `currentPhaseId`. `phase_status`
   stays transient.

## Consequences

- There is one concept, one request API, and one answer API for Phases,
  hooks, and Tools. Hosts render one interaction surface.
- v0.13.0 is breaking for every `PhaseInteraction*` import and for
  `run.respond`. Mori is the only consumer and moves in the same change.
- A host reads the current Phase from durable state.
