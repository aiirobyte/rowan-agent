# Rowan Agent Plan

## Goal

Keep Rowan Agent planning, implementation notes, and working context organized.

The main project roadmap now lives in:

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
- v0.4.0 planned: protocol boundary, runtime split, context import cleanup, runtime/runner terminology, and MCP ownership under runtime.

Planning status enum:

| Status | Meaning |
|---|---|
| planned | scoped but not started |
| in-progress | actively being planned or implemented |
| implemented | complete and release-gate verified |
| deferred | explicitly moved out of the current version |

## Next Steps

1. Implement `docs/PLAN/v0.4.0/PLAN.md`: create `packages/protocol` and `packages/runtime`, move shared phase/model/tool/turn contracts into protocol, move execution mechanics plus MCP tool-provider ownership into runtime, and keep `agent` as a small public kernel/facade.
2. Implement v0.5.0: add context projection/rendering and provider-neutral `ConversationEntry[]`.
3. Resume policy and safety as v0.6.0 after the driver and context boundaries are clean.
4. Build replay/fork/compaction after source events and driver turns are cleanly separated.

## Notes

- Treat this file as a short planning index.
- Use `docs/PLAN/ROADMAP.md` as the editable source of truth for project evolution.
- Use `docs/PLAN/ARCHITECTURE.md` as the source of truth for package boundaries and DCP-style layering.
