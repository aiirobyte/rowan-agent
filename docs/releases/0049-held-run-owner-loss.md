# Rowan Agent 0.37.1 - A held Run whose owner dies fails like a running Run

An `input_required` Run with a live `execution` is now failed when that execution's owner is lost. A held Run no longer retains an unanswered Interaction while its Tool Call is left open.

- **Owner loss**: running and held Runs share one recovery path. Pending and in-progress Tool Calls are interrupted, open Interactions are recorded as `cancelled`, and the Run moves to `failed`.
- **Failure**: the Run reports `tool_indeterminate` with the in-progress Tool Call IDs when there are any; otherwise it reports `runtime_interrupted`.
- **Persistence**: cancelled Interactions are mirrored into the execution checkpoint, `openInteractions` is cleared, claim and operation receipts are dropped, and the transition records `input_required -> failed`.
- **Suspended Runs**: an `input_required` Run without an execution continues to survive owner loss. Answering it queues the Run for a new Execution Attempt.
- **Child reports**: a parent receives the failed Outcome for a child Run that fails this way.

Removed: the fingerprint replay path for lost held executions, including `ActiveExecution.usedReplayAnswers`, the `liveInteract` history/answer replay, and `InteractionRecord.payload`.

## Packages

- `@rowan-agent/agent` 0.37.1
