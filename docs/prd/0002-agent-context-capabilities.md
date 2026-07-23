# Agent Context capability assembly

Status: Accepted, amended by PRD-0003

Decision: [ADR-0003](../adr/0003-assemble-agent-context-capabilities.md)

## Outcome

Hosts supply concrete Tools, Skills, and Phases through `AgentContext`. Rowan internally adds built-in and Extension capabilities without exposing Agent-level resource allowlists.

## Public shape

```ts
type AgentDefinitionContext = {
  systemPrompt: string;
  tools: readonly Tool[];
  skills: readonly Skill[];
  phases?: PhaseRegistry;
};
```

Canonical Messages are Runtime State rather than Agent Configuration.
`AgentConfig` contains no `allowedTools`, `allowedSkills`, or `allowedPhases`
fields. A host selects ordinary Context resources before Agent creation or
configuration update; code-defined Rowan and Extension resources remain
internally owned.

## Internal assembly

1. Rowan lazily initializes configured Extensions.
2. Rowan combines the immutable Configuration Snapshot's Context resources,
   built-in controls, and Extension registrations.
3. Duplicate Tool or Phase names fail before the first model request.
4. Extension Tools use the Runtime Tool execution path.
5. Phase-local lists, hooks, and Runtime Tool policy may narrow but not broaden the current execution view.

## Non-goals

- Interpreting host Workflow ownership, configuration, graphs, or result merging.
- Adding Agent Options allowlists or an Extension sandbox.
- Persisting executable capability definitions in Durable Store; Config
  Provider retains or reconstructs immutable executable snapshots by token.

## Acceptance

- Generated public types contain no Agent-level `allowed*` fields.
- Context, built-in, and Extension capabilities assemble deterministically.
- Extension resources are visible and executable through normal Rowan paths.
- Name collisions fail before model execution.
- Event-driven scheduling, Input Request, Outcome, Run Event, and Tool Call
  suites remain green.
