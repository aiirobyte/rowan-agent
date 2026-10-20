# Rowan Agent 0.36.1 — Answering a Child Belongs to the Host

The `respond_interaction` Core Tool from 0.36.0 is removed. Who may answer a child's Interaction, under which permission, and who is recorded as answering are the host's policy, so the host registers that Tool itself: it checks `AgentSummary.parentAgentId` and answers through `AgentRuntime.respondInteraction`.

`delegate`, `parentAgentId`, and the child reports (`rowan.child-outcome`, `rowan.child-interaction`) are unchanged.

## Packages

- `@rowan-agent/agent` 0.36.1
