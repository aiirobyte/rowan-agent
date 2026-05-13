# Rowan Agent Plan

> New version work starts from `docs/spec.md`, `docs/prompt_plan.md`, `docs/todo.md`, and `docs/version/<semver>/`.
> This `docs/PLAN/` tree is retained as legacy planning history and roadmap context.

## Goal

Keep Rowan Agent planning, implementation notes, and working context organized.

Architecture-review docs now live outside the release plan tree:

- `CONTEXT.md`
- `docs/README.md`
- `docs/architecture/README.md`
- `docs/architecture/module-map.md`
- `docs/architecture/deepening-opportunities.md`
- `docs/adr/`

The legacy roadmap history remains in:

- `docs/PLAN/ARCHITECTURE.md`
- `docs/PLAN/ROADMAP.md`
- `docs/PLAN/v0.0.0/README.md`
- `docs/PLAN/v0.0.0/PLAN.md`
- `docs/PLAN/v0.1.0/README.md`
- `docs/PLAN/v0.1.0/PLAN.md`
- `docs/PLAN/v0.2.0/README.md`
- `docs/PLAN/v0.2.0/PLAN.md`
- `docs/PLAN/v0.3.0/README.md`
- `docs/PLAN/v0.3.0/PLAN.md`
- `docs/PLAN/v0.3.1/README.md`
- `docs/PLAN/v0.3.1/PLAN.md`
- `docs/PLAN/v0.3.2/README.md`
- `docs/PLAN/v0.3.2/PLAN.md`
- `docs/PLAN/v0.3.3/README.md`
- `docs/PLAN/v0.3.3/PLAN.md`
- `docs/PLAN/v0.3.4/README.md`
- `docs/PLAN/v0.3.4/PLAN.md`
- `docs/PLAN/v0.3.5/README.md`
- `docs/PLAN/v0.3.5/PLAN.md`
- `docs/PLAN/v0.4.0/README.md`
- `docs/PLAN/v0.4.0/PLAN.md`
- `docs/PLAN/v0.4.0/TASKS.md`
- `docs/PLAN/v0.4.1/README.md`
- `docs/PLAN/v0.4.1/PLAN.md`
- `docs/PLAN/v0.4.1/TASKS.md`
- `docs/PLAN/v0.4.2/README.md`
- `docs/PLAN/v0.4.2/PLAN.md`
- `docs/PLAN/v0.4.2/TASKS.md`
- `docs/PLAN/v0.4.3/README.md`
- `docs/PLAN/v0.4.3/PLAN.md`
- `docs/PLAN/v0.4.3/TASKS.md`

## Current Status

- Git repository initialized.
- `.agent/` workspace created for AI-agent readable context.
- Root `AGENT.md` added as the agent entrypoint.
- Competitive analysis archived out of the main plan tree.
- Project roadmap drafted.
- Technical architecture drafted.
- v0.0.0 execution pack drafted.
- v0.0.0 minimal architecture finalized from user decisions.
- v0.1.0 real model runtime implemented with mock tests; real API manual verification remains.
- v0.2.0 monorepo foundation and Workspace tools seed implemented.
- v0.3.0 implemented: route-first task gating and thread predecessor mechanism.
- v0.3.1 implemented: persistent Session, multi-turn Agent conversations, and session-aware CLI.
- v0.3.2 implemented: thread unification, immutable Session input, and task/goal metadata.
- v0.3.3 implemented: AgentStore port, JSON-backed step storage, and scoped context.
- v0.3.4 implemented: store package consolidation.
- v0.3.5 implemented: Pino runtime logging and trace package removal.
- Architecture direction updated on 2026-05-03: v0.4.0+ now follows a DCP-first hardening path before policy/replay/eval/workflow expansion.
- v0.4.0 implemented: protocol boundary, runtime split, context import cleanup, runtime/runner terminology, and MCP ownership under runtime.
- v0.4.1 implemented: corrected the Agent/runtime boundary by moving loop, thread, phases, task outcomes, and turn recording back into `packages/agent/src/` with no `core/` folder and no compatibility runtime re-exports.
- v0.4.2 implemented: atomized Agent loop inputs/outputs and exposed explicit runtime phase ports while keeping loop ownership in `agent`.
- v0.4.3 planned: consolidate Agent loop complexity at existing package boundaries before v0.5.0 context projection.
- Architecture docs reorganized on 2026-05-04 for `improve-codebase-architecture`: root domain context, ADR files, Module map, and deepening opportunities.
- Planning format changed on 2026-05-13: active version work now starts from `docs/spec.md`, `docs/prompt_plan.md`, `docs/todo.md`, and `docs/version/<semver>/`.

Planning status enum:

| Status | Meaning |
|---|---|
| planned | scoped but not started |
| in-progress | actively being planned or implemented |
| implemented | complete and release-gate verified |
| deferred | explicitly moved out of the current version |

## Next Steps

1. Implement v0.4.3: move provider-output normalization and tool execution glue to the existing `adapters` and `runtime` package boundaries while keeping Agent orchestration in `agent`.
2. Implement v0.5.0: add context projection/rendering and provider-neutral `ConversationEntry[]`.
3. Resume tool policy ports as v0.6.0 after the driver and context boundaries are clean.
4. Build replay/fork/compaction after source events and driver turns are cleanly separated.

## Notes

- Treat this file as a short planning index.
- Use `CONTEXT.md` for Rowan domain language.
- Use `docs/adr/` for accepted architecture decisions.
- Use `docs/architecture/deepening-opportunities.md` for architecture review candidates.
- Use `docs/PLAN/ROADMAP.md` as the editable source of truth for project evolution.
- Use `docs/PLAN/ARCHITECTURE.md` as the versioned architecture snapshot for package boundaries and DCP-style layering.
