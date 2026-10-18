# Rowan Agent 0.28.0 — a smaller PhaseExecution

## Removed from `PhaseExecution`

- `snapshot()` and `restore(snapshot)`, with the `PhaseContextSnapshot` type.
  Nothing called them, and `restore` rewrote the live conversation and System
  Prompt behind the durable store, which also broke the prompt-cache prefix.
  A code Phase that needs to work on the conversation without changing it calls
  `execution.runInternalModelLoop`.
- `executeTool(context, call)`. Use `executeTools(context, [call])`, which
  takes the same permission path.

`invokeModel`, `executeTools`, `runInternalModelLoop`, `reportStatus`,
`messages`, and `interaction` are unchanged.

## Packages

- `@rowan-agent/agent` 0.28.0
- Other package versions unchanged
