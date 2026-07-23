---
status: accepted, amended by ADR-0004
---

# Assemble Agent Context capabilities internally

`AgentConfig.context.tools`, `skills`, and `phases` remain the only host-facing
resource-supply interface. Rowan exposes no parallel `allowedTools`,
`allowedSkills`, or `allowedPhases` fields on Agent Configuration.

Rowan adds its built-in controls and code-defined Extension Tools and Phases internally. It rejects Tool and Phase name collisions before the first model request and adapts Extension Tools into the executable Runtime Tool path. Ordinary Phase Tool and Skill lists, hooks, and Runtime Tool policy may narrow the current execution view but cannot introduce a capability absent from the assembled Context.

Hosts that need a smaller Agent supply smaller `AgentContext` resource arrays. Rowan does not interpret host Workflow configuration or add a second allowlist interface.

## Consequences

- Agent Configuration remains free of parallel capability allowlists.
- Rowan-owned and Extension capabilities are determined by code rather than host allowlist fields.
- Extension Tools and Phases participate in the same model, routing, and execution paths as Context resources.
- Tool and Phase collisions fail before execution.
- Config Provider reconstructs the exact immutable Configuration Snapshot;
  Durable Store persists only its opaque Config Token, never executable
  capabilities.
