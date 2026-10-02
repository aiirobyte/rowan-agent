# Rowan Agent 0.15.4 — parallel Phase replies are committed

Previously, a parallel Phase (one of several `entryPhases`, or a parallel route target) ran in a forked message context that was discarded at the join. Its reply streamed out as `message_delta` events, but no `message_committed` event ever followed, so hosts could not attribute the streamed text to a Phase and the reply disappeared from `history()`. Only the join Phase's reply survived, through `previousResults` (`<prev_phase_outputs>`) and the Run's final output.

This release commits each parallel Phase's final plain-text reply through a new `commitPhaseOutput` store operation as soon as that Phase finishes. The committed message keeps the id of its streamed deltas and carries `metadata.phase`, plus `metadata.parallelPhase` (`groupId`, `instanceId`, `index`, `count`). The join Phase still receives the reply through `<prev_phase_outputs>`, so committed parallel replies are left out of later model context; Rowan-owned metadata never reaches the provider request. A reply that requested Tools is not committed again, because its Tool Calls already commit it.

The Run's final output is now located against the projected model context rather than the raw stored history, which differ once parallel replies are excluded.

## Packages

- `@rowan-agent/agent` 0.15.4
- Other package versions unchanged
