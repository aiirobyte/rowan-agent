# PRD: Direct Skill Bundles for File Phases

## Status

Approved local execution plan. This PRD implements
[ADR-0008](../adr/0008-phase-skill-bundles.md) and supersedes the conflicting
file-Phase Skill selector requirements in PRD-0006.

## Problem

Rowan currently resolves a Phase's `skills` names against the Agent's flat
Scope-level Skill pool. An omitted field exposes every parent Skill, so entering
a Phase cannot establish an isolated local Skill context. File trees may
already contain child Skills, but the loader and runtime ignore them.

## Outcome

`loadPhase` returns a complete Phase Bundle. The loop replaces Skills on Phase
entry, restores Scope Skills in `default`, and every execution path uses the
same active Bundle values.

## Requirements

### R1: File Bundle loading

- Preserve shallow `loadSkills` behavior.
- Load direct child Skills while loading one Phase.
- Reject wrong-depth/wrong-kind markers, duplicate local names, invalid child
  metadata, and child execution failures as one parent error.
- Preserve non-marker attachments and existing Phase code discovery.
- Keep inline/programmatic Phase contributions valid with empty Skills.

### R2: Runtime visibility

- Default uses the Definition's selected Scope Skills.
- File Phase entry uses only its direct Bundle Skills.
- Phase transition to default restores Scope Skills.
- Serial, parallel, factory, input-resume, and checkpoint behavior agree.
- The route Tool lists Phase metadata but not nested Skill names before entry.

### R3: Registry and snapshots

- Register each top-level Phase Bundle as one source value and one revision.
- Do not register child Skills as independent Resource Registry values.
- Deep-snapshot Bundle Skills for active and input-waiting Runs.
- Preserve Source IDs, Resource Views, source-qualified refs, and existing store
  schema/recovery semantics.

### R4: Extensions

- Add async directory Bundle registration to `ExtensionAPI`.
- Reuse the public loader and normal Phase execution lifecycle.
- Roll back an Extension whose Bundle is invalid.
- Keep inline code-only host contributions as empty-Skill Phases; remove the
  old Extension Skill-name selector.

### R5: Breaking public contract

- Remove file-Phase `skills?: string[]` behavior from the Rowan public type.
- Update validators, route metadata, factories, Extension adapters, public
  exports, docs, fixtures, and tests.
- Release the package as `0.9.0`; verify with a local packed artifact.

## Non-goals

- Workflow or host business concepts in Rowan
- Recursive global Skill discovery
- Per-Phase filesystem authorization
- Nested Resource Catalogs, Source IDs, or revisions
- Runtime database migration or compatibility readers

## Acceptance

- Resource-loading tests prove direct child Bundle loading and strict parent
  failure without partial Skills.
- Runtime tests prove replacement/restoration across every execution path,
  immutable snapshots, and route disclosure.
- Extension tests prove directory registration, execution code reuse,
  duplicate handling, and activation rollback.
- Full package tests, typecheck, build, public interface check, and `bun pack`
  pass.
