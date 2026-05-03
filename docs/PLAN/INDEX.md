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
- v0.2.0 monorepo foundation and Workspace ACI seed implemented.
- v0.3.0 implemented: route-first task gating and child-session predecessor mechanism.
- v0.3.1 implemented: persistent Session, multi-turn Agent conversations, and session-aware CLI.
- v0.3.2 implemented: thread/sub-session unification, immutable Session input, and task/goal metadata.
- v0.3.3 implemented: AgentStore port, JSON-backed step storage, and scoped context.
- v0.3.4 planned: store package consolidation.

## Next Steps

1. Implement v0.3.4 `@rowan-agent/store` package consolidation.
2. Move `AgentStore`, `ExecutionTurn`, in-memory store, and JSON store into `packages/store`.
3. Keep v0.3.3 persisted JSON schema stable while changing package ownership.

## Notes

- Treat this file as a short planning index.
- Use `docs/PLAN/ROADMAP.md` as the editable source of truth for project evolution.
