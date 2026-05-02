# Rowan Agent Plan

## Goal

Keep Rowan Agent planning, implementation notes, and working context organized.

The main project roadmap now lives in:

- `docs/PLAN/ARCHITECTURE.md`
- `docs/PLAN/ROADMAP.md`
- `docs/PLAN/AGENT_COMPETITIVE_ANALYSIS.md`
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

## Current Status

- Git repository initialized.
- `.agent/` workspace created for AI-agent readable context.
- Root `AGENT.md` added as the agent entrypoint.
- Competitive analysis drafted.
- Project roadmap drafted.
- Technical architecture drafted.
- v0.0.0 execution pack drafted.
- v0.0.0 minimal architecture finalized from user decisions.
- v0.1.0 real model runtime implemented with mock tests; real API manual verification remains.
- v0.2.0 monorepo foundation and Workspace ACI seed implemented.
- v0.3.0 implemented: route-first task gating and sub_session mechanism.
- v0.3.1 implemented: persistent Session, multi-turn Agent semantics, and session-aware CLI.
- v0.3.2 implemented: thread/sub-session unification, immutable Session input, and task/goal metadata.

## Next Steps

1. Keep v0.3.2 release gates green after follow-up changes.
2. Use `docs/PLAN/ROADMAP.md` to scope v0.4.0 policy and safety work.
3. Preserve the thread/sub-session compatibility API until a later migration window.

## Notes

- Treat this file as a short planning index.
- Use `docs/PLAN/ROADMAP.md` as the editable source of truth for project evolution.
