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
- v0.3.1 planned: persistent Session, multi-turn Agent semantics, and session-aware CLI.

## Next Steps

1. Implement `SessionStore` and local JSON persistence under `<workspace>/sessions`.
2. Make `Agent.prompt()` append turns to an existing Session instead of always creating a new Session.
3. Add CLI `--session <id>` and `sessions list/show/delete`.
4. Add minimal `rowan chat` interactive mode.
5. Link every per-turn trace to the persistent session id.

## Notes

- Treat this file as a short planning index.
- Use `docs/PLAN/ROADMAP.md` as the editable source of truth for project evolution.
