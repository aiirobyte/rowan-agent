---
status: accepted
---

# Assemble Agent Context capabilities internally

`AgentContext.tools`, `skills`, and `phases` remain the only host-facing resource-supply interface. Rowan exposes no parallel `allowedTools`, `allowedSkills`, or `allowedPhases` fields on `AgentOptions`.

Rowan adds its built-in controls and code-defined Extension Tools and Phases internally. It rejects Tool and Phase name collisions before the first model request and adapts Extension Tools into the executable Runtime Tool path. Ordinary Phase Tool and Skill lists, hooks, and Runtime Tool policy may narrow the current execution view but cannot introduce a capability absent from the assembled Context.

Hosts that need a smaller Agent supply smaller `AgentContext` resource arrays. Rowan does not interpret host Workflow configuration or add a second allowlist interface.

## Consequences

- Agent Options remain policy-free.
- Rowan-owned and Extension capabilities are determined by code rather than host allowlist fields.
- Extension Tools and Phases participate in the same model, routing, and execution paths as Context resources.
- Tool and Phase collisions fail before execution.
- Reconstruction reassembles the current Context rather than persisting executable capability snapshots.
