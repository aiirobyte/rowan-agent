# Rowan Agent 0.36.0 — Child Agents

A Phase can hand work to another Agent and hear back, without the host wiring the two together.

- `PhaseExecution.agents.delegate({ agentId?, create, input, metadata?, idempotencyKey? })` returns `{ agentId, runId, created }` at once; the child runs in the background.
  - Without `agentId` it creates a child Agent (`create` builds its configuration) whose `parentAgentId` is the current Agent, and starts its Run with `input`. `metadata` becomes the child's Agent metadata and its first Run's metadata.
  - With `agentId` it continues that child: a Run waiting for input resumes with `input` as the answer, a running one gets a new Run queued behind it, a settled one starts a new Run that sees the child's history. An `agentId` that is not a child of the current Agent is refused with `RuntimeError` code `not_child_agent`.
  - The default `idempotencyKey` comes from the Run, the Phase visit, the Phase and the call's position, so a re-executed Phase finds its child instead of creating another.
- `AgentSummary` gains `parentAgentId`. Only `delegate` sets it.
- A child reports to its parent. For every child Run, a durable consumer (`rowan:child-reports`) starts a Run on the parent with an input whose content is compact JSON and whose `metadata` is `{ kind, childAgentId, childRunId, state?, interactionId?, interactionKind? }`:
  - `rowan.child-outcome` when the Run settles: the Outcome's `message` and `payload`, or the failure or the cancellation reason.
  - `rowan.child-interaction` for each Interaction the Run raises: its kind and prompt, its `payload`, and for a Tool Call permission the `toolCall` name and arguments.
  Redelivery never duplicates an input.
- The `respond_interaction({ agentId, interactionId, answer })` Core Tool, available to an Agent that has children, answers a pending Interaction of one of its children. It returns a failed result for an Agent that is not its child and for an Interaction that is no longer pending, such as one the person answered first.

The SQLite store schema is now `rowan.agent.runtime:3`; databases of earlier versions are rejected and must be recreated.

## Packages

- `@rowan-agent/agent` 0.36.0
