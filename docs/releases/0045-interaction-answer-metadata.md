# Rowan Agent 0.36.2 — Interaction Answer Metadata

An Interaction record keeps opaque host metadata about how it ended. Rowan stores it and never interprets it, like Agent and Run metadata; a host can use it to record who answered.

- `AgentRuntime.respondInteraction(runId, { interactionId, input?, cancel?, metadata? })` (and `AgentRun.respondInteraction`) accepts `metadata`, validated like other metadata. It is stored as `answerMetadata` on the Interaction record for both outcomes, answered and cancelled, whether the Interaction is live or durable.
- When a new input resumes a waiting Run and its open Interactions become `replied`, the input's `metadata` is stored as each replied Interaction's `answerMetadata`. A child report (`rowan.child-outcome`, `rowan.child-interaction`) resuming a waiting parent therefore leaves the report's metadata on the parent's replied Interactions.
- `RunInteraction` and the committed Interaction message gain `answerMetadata?: JsonObject`; it appears in history, events, and live Interaction events.
- The raiser still receives exactly the `input` as the answer; `answerMetadata` never reaches it.

The SQLite store schema is unchanged.

## Packages

- `@rowan-agent/agent` 0.36.2
