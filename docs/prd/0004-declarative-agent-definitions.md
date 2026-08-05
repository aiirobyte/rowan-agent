# Declarative Agent Definitions

Status: Superseded by PRD-0005. This remains the historical record for the
original declarative Resource selection contract.

Decision: [ADR-0005](../adr/0005-resolve-agent-definitions-after-extension-assembly.md)

This PRD supersedes the public Context shape in PRD-0002 while retaining its
Extension assembly, collision, and execution-authority rules.

## Problem

Hosts currently construct a fully selected `AgentConfig.context` before Rowan
loads code-defined Extensions. Agent and Phase resource selections therefore
use separate parsers and resolution paths, and a host cannot reference an
Extension-contributed Tool or Phase through the same declarative definition as
an ordinary resource.

## Outcome

Accept one declarative Agent Definition plus concrete Resource Candidates.
Resolve Extension references and assemble Extensions first, then resolve Agent
and Phase Tool, Skill, and Phase names through one deterministic warning-aware
resolver. Preserve immutable Configuration Snapshots and all durable execution
semantics.

## Requirements

### R1: Common definition and parser

- Export `AgentDefinition` with required `name`, `description`, and `prompt`,
  plus optional `tools`, `skills`, `phases`, `extensions`, `entryPhase`, and
  `model`.
- Resource selections accept string lists only. Omitted inherits all
  candidates, `[]` selects none, and a non-empty list selects matching names.
  Duplicates have set semantics and no wildcard exists.
- Reuse Markdown/frontmatter parsing and `parseModelRef` across Agent and Phase
  definitions. Phase adds its own target, input, isolation, and routing fields
  after common normalization.
- Export the generic Frontmatter document parser for hosts that extend a
  Definition with domain-only fields; those hosts must not parse the same
  document through a second YAML or delimiter implementation.
- Invalid YAML, missing required fields, invalid types, and invalid model
  references fail before Agent or Run mutation.

### R2: Agent Configuration

- Replace `AgentConfig.context` with `definition` and candidate
  Tools/Skills/Phases/Extensions while preserving the model/stream union,
  hooks, policies, `cwd`, and stable config identity.
- Remove `AgentDefinitionContext`, `promptContext`, deprecated aliases, and
  compatibility normalization.
- The Config Provider reconstructs the complete immutable Agent Configuration
  for a token; Rowan persists no executable Definition or resource closure.

### R3: Extension-first resolution

- Resolve `definition.extensions` against Extension candidates. Missing names
  warn and are skipped.
- Initialize selected Extensions and assemble their Tools and Phases before
  resolving Definition Tool/Skill/Phase selections.
- Reject duplicate executable Tool and Phase names before the first model
  request.
- Extension Tools continue through the Runtime Tool execution path.

### R4: Shared selection behavior

- Use one name resolver for Agent and Phase Tool/Skill/Phase restrictions.
- Missing selected names emit a warning containing resource kind and name, then
  disappear from the resolved view.
- A Definition entry Phase takes precedence over the candidate Phase Registry
  entry. A missing requested entry warns and falls back to built-in `default`;
  otherwise the registry entry and then `default` apply.
- Selection can only narrow Resource Candidates. Hooks, Phase configuration,
  and Runtime Tool policy cannot introduce a missing candidate.

### R5: Execution continuity and release

- Never re-resolve a different Agent Configuration inside a started Run.
- An Input Request resumes from the Configuration Snapshot that produced its
  Execution Checkpoint even when the Agent's current config changes.
- Existing Agent/Run scheduling, Store, Tool, event, interruption, and recovery
  contracts remain unchanged.
- Build and public-interface checks prove the breaking declarations before
  publishing `@rowan-agent/agent@0.8.5`.

## Non-goals

- Interpreting host Team, Project, Task, Workflow, or authorization models
- Adding a public resource-registration service or Extension sandbox
- Persisting executable resource catalogs in the Durable Store
- Preserving `AgentConfig.context` source compatibility

## Acceptance

- Parser tests cover every common field and omitted/empty/present list
  semantics for Agent and Phase definitions.
- Resolution tests cover Extension-contributed names, warnings, empty results,
  entry fallback, and fatal collisions.
- Runtime tests prove resolved content/resources reach model execution and that
  Input Request continuation remains snapshot-pinned.
- Generated declarations expose the new contract and contain none of the
  removed Context compatibility names.
- Package tests, typecheck, build, public-interface check, and diff check pass.
