---
name: Verify
description: >
  Programmatic verification phase — runs checks without LLM.
  Uses the run() function in index.ts for automated validation.
---

# Verify Phase

This phase runs automated verification checks defined in `index.ts`.
The LLM is not invoked — the `run()` function handles all logic.

## What it checks

- All implementation steps have `verified: true` in the payload
- Tests pass (if applicable)
- No regressions detected

## Routing

- Returns `"stop"` when all checks pass
- Returns `"continue"` to re-run if checks are still pending
