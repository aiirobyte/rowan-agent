# Rowan Agent Plan

## Goal

Keep Rowan Agent planning, implementation notes, and working context organized.

The main project roadmap now lives in:

- `docs/PLAN/ARCHITECTURE.md`
- `docs/PLAN/ROADMAP.md`
- `docs/PLAN/AGENT_COMPETITIVE_ANALYSIS.md`
- `docs/PLAN/v0/README.md`
- `docs/PLAN/v0/PLAN.md`
- `docs/PLAN/v0.1/README.md`
- `docs/PLAN/v0.1/PLAN.md`
- `docs/PLAN/v0.2/README.md`
- `docs/PLAN/v0.2/PLAN.md`

## Current Status

- Git repository initialized.
- `.agent/` workspace created for AI-agent readable context.
- Root `AGENT.md` added as the agent entrypoint.
- Competitive analysis drafted.
- Project roadmap drafted.
- Technical architecture drafted.
- v0 execution pack drafted.
- v0 minimal architecture finalized from user decisions.
- v0.1 real model runtime implemented with mock tests; real API manual verification remains.
- v0.2 monorepo foundation and Workspace ACI seed implemented.

## Next Steps

1. Run v0.1 with a real OpenAI-compatible API key.
2. Verify default real model mode with `bun run rowan "hello"` and confirm `.rowan/runs/` receives a JSONL trace.
3. Verify v0.2 with a real OpenAI-compatible API key.
4. Prepare v0.3 Policy and Safety planning.

## Notes

- Treat this file as a short planning index.
- Use `docs/PLAN/ROADMAP.md` as the editable source of truth for project evolution.
