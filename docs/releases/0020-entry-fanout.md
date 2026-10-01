# Rowan Agent 0.15.0 — start a Run with several parallel entry Phases

Previously, an Agent Run supported only a single entry Phase (`layer.phases.entryPhaseId` and an optional single `phasePayload` on `runtime.start`). When host directives (such as Mori's explicit Phase directives) specify multiple entry Phases in one turn, the Run needs to dispatch them concurrently at the start.

This release introduces `entryPhases?: ReadonlyArray<{ phase: string; payload?: JsonValue }>` on `runtime.start`, mutually exclusive with `phasePayload`. Entry phases are persisted on `RunRecord` and `RunSnapshot` across both `InMemoryStore` and `SqliteStore`. On a fresh start with two or more entry phases, Rowan dispatches all of them concurrently through the existing parallel phase runner (isolated phases receive an empty message history, forked phases receive a snapshot of messages, instance IDs are generated with duplicate handling, and payloads are normalized against their phase schemas). After awaiting all concurrent tasks, their outputs are stashed in `previousResults` (injected into context as `<prev_phase_outputs>`), and execution joins at the agent's configured `entryPhaseId`. Starting with exactly one entry phase behaves identically to running that phase as the entry phase with its payload. Checkpoints preserve `entryPhases`, and mid-run resumption does not re-dispatch completed work.

## Packages

- `@rowan-agent/agent` 0.15.0
- Other package versions unchanged
