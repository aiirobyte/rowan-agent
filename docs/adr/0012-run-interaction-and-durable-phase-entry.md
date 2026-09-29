---
status: accepted
---

# Run Interaction and Durable Phase Entry

Rowan has one interaction model under three names and two answer paths:

- the ADR-0010 Phase Interaction;
- the ADR-0011 Tool Call Interaction, which reuses it;
- the legacy Input Request, with its own `respond({ requestId })`.

How an answer reaches the conversation depends on an `origin` flag. Phase
progress is only transient.

This ADR makes the interaction a Run-level concept:

- one answer path;
- three final states;
- one structured transcript entry per resolved interaction;
- Tools can raise interactions while they execute;
- Phase entry is recorded durably.

Decided with the owner (Andrew) on 2026-09-29.

## Context

- A `PhaseInteraction` already belongs to the Run. The Run enters
  `input_required`, lists `run.interactions`, and resolves them through
  `run.respondInteraction`. It resumes only when no interaction is open
  (`durable-store.ts` `answerInteraction`). `phase` only says where the
  interaction was raised.
- ADR-0011 routes `before_tool_call` interactions through the same driver.
  `ToolCallInteractionKind` is an alias of `PhaseInteractionKind`.
- `answerInteraction` writes a Phase-origin answer into the transcript as a
  user message: the string, or `JSON.stringify` of the answer. A
  `tool_call`-origin answer is not written. Clicking "Allow" on a card
  therefore leaves a JSON text user message in the conversation, and the
  behaviour depends on `origin`.
- The Input Request (CONTEXT.md: "a legacy `user_input` Phase Interaction
  projection") keeps a second answer API, `run.respond({ requestId, input })`.
- A Tool's `execute` gets `ToolInvocationContext` without an interaction
  driver, so only a hook can ask the person anything.
- `phase_status` is a transient `RunEvent`. After a restart or a late
  subscription, the current Phase can only be inferred.

## Decision

1. **Run Interaction (breaking, v0.13.0, no aliases).**
   - Every public `PhaseInteraction*` / `ToolCallInteraction*` type, class, and
     export becomes `RunInteraction*`. This covers the driver, the boundary,
     the cancelled error, and the kind, status, and state types.
   - `PhaseInteractionOrigin` and `origin` are removed. `phase` is always
     present, and `toolCallId` is present when the interaction was raised on
     a Tool call, by a `before_tool_call` hook or by the Tool's own `execute`.
2. **Three final states.** A Run Interaction is `pending` until it becomes
   exactly one of:
   - `answered` — resolved with a JSON answer that Rowan does not interpret;
   - `replied` — the person sent new Agent Input instead of answering;
   - `cancelled` — the person cancelled it, or the Run was cancelled, or the
     host expired it.
3. **One answer path.** Remove the Input Request, `InputRequest*`,
   `InputRequiredCommit`, and `run.respond`.
   - `run.respondInteraction({ interactionId, input })` answers one
     interaction.
   - `run.respondInteraction({ interactionId, cancel: true })` cancels one.
   - When the Agent receives new Agent Input while its Run is
     `input_required`, every pending interaction of that Run becomes
     `replied`, and the input is committed as an ordinary user message after
     them.
   - The Run resumes as soon as no interaction is pending. New Agent Input
     always resumes it at once. A card answer resumes it only when it resolved
     the last pending interaction.
4. **The interaction's final state is the message.** Rowan never writes an
   answer as a user message.
   - On reaching a final state, Rowan commits one structured **Interaction
     Record** to the transcript. It holds id, kind, prompt, phase,
     `toolCallId`, status, and answer.
   - When the transcript is projected to the model, each record becomes text
     through the interaction's **result template**. The requester declares the
     template at request time as plain durable data: one string per final
     state, with `{{prompt}}`, `{{answer}}`, and `{{reply}}` placeholders.
   - Without a template, Rowan's default for the kind and state applies.
     Rowan still never interprets the answer's schema.
   - A record with a `toolCallId` is folded into that Tool call's result when
     projected, and never becomes a separate model message. This keeps the
     provider rule that a tool result directly follows its tool call.
5. **Tools raise Run Interactions.** `ToolInvocationContext.interaction` is a
   `RunInteractionDriver` with the direct Phase contract: `request`,
   `answers`, `checkpoint`, `clearCheckpoint`, `suspend`. A suspended Tool
   call re-executes on resume with its answers and checkpoint, which is the
   ADR-0011 re-entry rule applied to `execute`. Cancellation never executes
   the Tool.
6. **Durable Phase entry.** The durable run event `phase_entered`
   (`runId`, `executionId`, `phaseId`, `visit`) is committed on every Phase
   entry, including repeat visits. `RunSnapshot.currentPhaseId` holds the last
   entered Phase. `phase_status` stays transient.
7. **Upgrading a store.** An open v0.12 Input Request is not migrated. Its Run
   is cancelled during the upgrade with the reason "Input Request retired in
   v0.13". Answer messages written by earlier versions stay as they are.

## Consequences

- There is one concept, one answer API, three final states, and one
  transcript shape, whether a Phase, a hook, or a Tool raised the interaction.
  A host renders one interaction surface. Answered cards leave a record, not
  a JSON user message.
- A Run left waiting on a v0.12 Input Request is cancelled by the upgrade.
- v0.13.0 is breaking for every `PhaseInteraction*` import and for
  `run.respond`. Mori is the only consumer and moves in the same effort.
- Hosts read the current Phase from durable state.
