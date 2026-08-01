# Declarative Agent Definitions issue slices

Status: Implemented and locally verified; public package release remains. No
GitHub Issues have been created.

Source: [PRD-0004](../prd/0004-declarative-agent-definitions.md)

Decision: [ADR-0005](../adr/0005-resolve-agent-definitions-after-extension-assembly.md)

Each slice follows one red → green cycle and preserves the durable Runtime
contracts from PRD-0003. Do not publish these drafts to GitHub Issues without a
separate explicit request.

## Slice 1: Add common Definition parsing

- Add failing tests for common Agent/Phase fields, required body content,
  list-only syntax, omitted/empty/present semantics, duplicate set behavior,
  and model references.
- Export `AgentDefinition` and reuse the common parser from Phase loading.
- Keep Phase-only fields and Phase Registry behavior explicit.

## Slice 2: Resolve candidates after Extensions

- Add failing execution tests for Extension-selected resources, missing-name
  warnings, empty selections, duplicate collisions, and entry fallback.
- Resolve selected Extensions before Agent and Phase Tool/Skill/Phase names.
- Share one resolver without adding a registration service or host-domain
  knowledge.

Depends on: Slice 1.

## Slice 3: Replace AgentConfig Context

- Add public-interface and Runtime tests for Definition plus Resource
  Candidates.
- Delete `AgentConfig.context`, `AgentDefinitionContext`, `promptContext`, and
  compatibility code in one breaking change.
- Preserve model/stream safety, hooks, policies, cwd, stable identities, Config
  Provider reconstruction, and Input Request snapshot pinning.

Depends on: Slice 2.

## Slice 4: Verify and release 0.8.5

- Migrate Rowan examples and internal fixtures to the new public API.
- Run tests, typecheck, build, public-interface verification, and diff checks.
- Inspect the packed artifact and publish `@rowan-agent/agent@0.8.5` only after
  all declarations and release contents are verified.

Depends on: Slices 1–3.
