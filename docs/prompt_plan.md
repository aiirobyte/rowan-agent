# Rowan Current Prompt Plan

Last updated: 2026-05-14

Specific version prompt plans live under `docs/version/<semver>/prompt_plan.md`.

## Active Version

v0.4.4 is complete. Prepare v0.5.0 planning:

```text
Read AGENT.md.
Read docs/todo.md.
Read docs/spec.md.
Read docs/version/README.md.
Read docs/version/0.4.4/spec.md.
Read docs/version/0.4.4/prompt_plan.md.
Read docs/version/0.4.4/todo.md.
Inspect the current diff with git status --short.
Create docs/version/0.5.0/spec.md, prompt_plan.md, and todo.md before implementation.
```

Current next prompt:

- v0.5.0 planning handoff: create versioned planning docs for Context Projection And Provider IR.

## Operating Rule

Before starting any prompt:

1. Read `AGENT.md`.
2. Read `docs/todo.md`.
3. Read `docs/spec.md`.
4. Read `docs/version/README.md`.
5. Read the active version files under `docs/version/<semver>/`.
6. Inspect the current diff with `git status --short`.
7. Preserve user changes and update the active version todo when a prompt is completed.

When the active version changes:

1. Create `docs/version/<semver>/spec.md`.
2. Create `docs/version/<semver>/prompt_plan.md`.
3. Create `docs/version/<semver>/todo.md`.
4. Sync `docs/spec.md`, `docs/prompt_plan.md`, `docs/todo.md`, and `docs/version/README.md`.
5. Keep `docs/PLAN/` as legacy reference unless the user asks for a full historical migration.
