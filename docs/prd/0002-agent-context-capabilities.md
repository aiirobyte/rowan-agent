# Agent Context capability assembly

Status: Accepted

Decision: [ADR-0003](../adr/0003-assemble-agent-context-capabilities.md)

## Outcome

Hosts supply concrete Tools, Skills, and Phases through `AgentContext`. Rowan internally adds built-in and Extension capabilities without exposing Agent-level resource allowlists.

## Public shape

```ts
type AgentContext = {
  systemPrompt: string;
  messages: AgentMessage[];
  tools: Tool[];
  skills: Skill[];
  phases?: PhaseRegistry;
};
```

`AgentOptions` contains no `allowedTools`, `allowedSkills`, or `allowedPhases` fields. A host selects ordinary Context resources before Agent construction; code-defined Rowan and Extension resources remain internally owned.

## Internal assembly

1. Rowan lazily initializes configured Extensions.
2. Rowan combines Context resources, built-in controls, and Extension registrations.
3. Duplicate Tool or Phase names fail before the first model request.
4. Extension Tools use the Runtime Tool execution path.
5. Phase-local lists, hooks, and Runtime Tool policy may narrow but not broaden the current execution view.

## Non-goals

- Interpreting host Workflow ownership, configuration, graphs, or result merging.
- Adding Agent Options allowlists or an Extension sandbox.
- Persisting executable capability definitions in Runtime State.

## Acceptance

- Generated public types contain no Agent-level `allowed*` fields.
- Context, built-in, and Extension capabilities assemble deterministically.
- Extension resources are visible and executable through normal Rowan paths.
- Name collisions fail before model execution.
- Existing routing, parallel execution, suspension, Outcome, Runtime Event, and Tool Call suites remain green.
