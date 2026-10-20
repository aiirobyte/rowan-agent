# Rowan Agent 0.36.3 — Report Live Child Interactions

A child Agent's Interaction raised while one of its tools runs (a live Interaction, for example a permission request) now reaches its parent. Before, only an Interaction that moved the child Run to `input_required` was reported, so a mid-tool request waited for an answer the parent never heard about.

- The parent gets a Run with the same `rowan.child-interaction` input as for an `input_required` child, keyed `child-interaction:<childRunId>:<interactionId>`, so a later report of the same Interaction finds the Run already started.
- The report is best effort: a live Interaction is not durable (it is cancelled on restart), so no consumer replays it.
- The parent answers with `respondInteraction(childRunId, { interactionId, input })` as before.

No new events, fields, or options.

## Packages

- `@rowan-agent/agent` 0.36.3
