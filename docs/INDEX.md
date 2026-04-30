# Rowan Agent Plan

## Goal

Keep Rowan Agent planning, implementation notes, and working context organized.

The main project roadmap now lives in:

- `docs/ARCHITECTURE.md`
- `docs/ROADMAP.md`
- `docs/AGENT_COMPETITIVE_ANALYSIS.md`
- `docs/v0/README.md`
- `docs/v0/PLAN.md`
- `docs/v0.1/README.md`
- `docs/v0.1/PLAN.md`

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

## Next Steps

1. Run v0.1 with a real OpenAI-compatible API key.
2. Verify `--openai-compatible --trace` writes a real model trace.
3. Decide whether v0.2 starts with workspace ACI or native provider adapters.
4. Keep v0 fake mode as the regression baseline.

## Notes

- Treat this file as a short planning index.
- Use `docs/ROADMAP.md` as the editable source of truth for project evolution.
