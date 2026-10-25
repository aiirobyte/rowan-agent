# Rowan Agent 0.39.0 - Definition metadata and Control Run host metadata

Agent Definitions and Phases now share one frontmatter metadata rule, and hosts
can add correlation data to the Control Runs they start.

- **One metadata rule**: Rowan-known keys stay fields. Every other JSON-safe key
  becomes flat `metadata`; an explicit `metadata:` mapping is flattened into the
  same place.
- **Authoring errors**: a non-mapping `metadata`, a key repeated at the top level
  and inside `metadata`, or a Rowan-known field inside `metadata` fails loading.
  Agent Definition failure is a `TypeError`; Phase failure is an
  `invalid_metadata` `ResourceMetadataError`.
- **Agent Definition metadata**: `AgentDefinition.metadata` is accepted by
  validation and survives Configuration Snapshots. Unrecognized Agent
  Definition keys now arrive there instead of being dropped.
- **Browser-safe authoring export**:
  `normalizeDefinitionMetadata(kind, frontmatter)` returns Rowan fields, flat
  metadata, and structured problems without making hosts re-list Rowan keys.
- **Control Run metadata**: `AgentRuntime.runPhase` accepts optional
  `metadata`, merged beside the reserved `rowan` key. A host-supplied `rowan`
  key is rejected; Extension Agents APIs still cannot set Run metadata.
- **Hook visibility**: `before_tool_call` receives Control Run metadata through
  its existing `event.metadata` field.

An already-active Control Phase Run for the same Phase is still returned
unchanged, including its original metadata.

## Packages

- `@rowan-agent/agent` 0.39.0
- `@rowan-agent/models` 0.13.0
