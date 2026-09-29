# Rowan Agent 0.13.0 — Run Interactions and durable Phase entry

## Run Interaction API

- Renamed Phase and Tool Call interaction exports to `RunInteraction*`; removed legacy origin tags and the `run.respond` Input Request path.
- Resolved requests now persist as structured Interaction Records with answered, replied, or cancelled outcomes and template-based model projection.
- Tool `execute` may request an interaction and suspend with durable checkpoint data; resume re-enters the Tool with its answer, and cancellation prevents execution.
- Legacy open v0.12 Input Requests are cancelled during upgrade with `Input Request retired in v0.13`.

## Phase events

Every Phase entry is recorded as a durable `phase_entered` event, including repeat visits. Run snapshots expose the latest `currentPhaseId`; `phase_status` remains transient.

## Packages

- `@rowan-agent/agent` 0.13.0
- `@rowan-agent/models` 0.13.0
- `@rowan-agent/cli` 0.13.0
- `@rowan-agent/logging` 0.13.0

## Compatibility

Breaking release. Consumers must migrate `PhaseInteraction*`, `ToolCallInteraction*`, Input Request response APIs, and `run.respond` to Run Interactions and `respondInteraction`. Nothing was published as part of this change.
