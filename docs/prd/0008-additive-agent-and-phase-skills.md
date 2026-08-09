# PRD: Layered Agent and Phase Skills

## Status

Accepted local implementation record for
[ADR-0009](../adr/0009-additive-agent-and-phase-skills.md).

## Requirements

- Serial and parallel Phase execution receives root Agent Context Skills plus
  the active Phase Bundle Skills.
- The implicit `default` Phase remains root-only.
- `AgentDefinition.bundledSkills` is host-supplied parent guidance and is
  merged after selector-selected Scope Skills; same-name parent Skills replace
  Scope values.
- Phase Bundle Skills are merged after parent Skills; same-name Phase Skills
  replace parent values.
- Bundle Skill values are snapshotted with their parent definition or Phase.
- Existing Tool, Phase, Context, routing, and durable Run semantics remain
  unchanged.

## Acceptance

- Public Runtime tests cover serial and parallel Phase contexts, including
  same-name replacement.
- Public Runtime tests cover parent Bundle Skills beside selected Scope Skills
  and same-name replacement.
- Focused tests, typecheck, build, and public-interface checks pass.
