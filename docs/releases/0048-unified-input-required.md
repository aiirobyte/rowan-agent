# Rowan Agent 0.37.0 — Every Interaction puts its Run in `input_required`

`input_required` now means exactly that the Run has at least one pending Interaction. Execution liveness is a separate fact: a Run may still have a live `execution` while it waits.

- **Held Interaction**: an Interaction raised inside a running model call, Tool hook, or bridged external Provider reaches the Durable Store before it waits. The Run moves `running → input_required`, keeps its execution token and current Phase, and remains able to commit messages, Tool Call state, Phase output, and its final outcome. A second Interaction appends to the same Run; a same-state `run_state_changed` event carries the complete open Interaction set.
- **Suspended Interaction**: a Phase or turn boundary still commits a checkpoint and ends its execution. Answering it queues the Run for a new Execution Attempt, as before.
- **Answering**: every answer is recorded durably first. If the execution is still live, the last open Interaction moves the Run `input_required → running`; otherwise the Run moves to `queued`.
- **New Agent Input**: replying to a held Run marks every open Interaction `replied`, keeps its execution, returns it to `running`, and rejects the held wait with the rendered `replied` text. Replying to a suspended Run still queues it.
- **Restart recovery**: an Interaction whose owner died keeps its pending state but loses the stale execution token. Answering it queues the Run. Replay matches an already answered Interaction by kind, prompt, payload, and Tool Call identity, so the stored answer is returned without asking again.
- **Control Runs**: a Control Run cannot claim beside an `input_required` Run that still owns a live execution; a suspended Run does not block it.
- **Boundary**: `run.wait()` still returns at `input_required`. At that boundary the execution may still be alive.

Removed: the transient `live_interaction` event and its public `LiveInteractionEvent` type; the snapshot merge of in-memory Interactions; and the special live child-report and Phase lookups. Child Interactions are reported from the durable `run_state_changed → input_required` event, with the existing per-Interaction idempotency key.

## Packages

- `@rowan-agent/agent` 0.37.0
