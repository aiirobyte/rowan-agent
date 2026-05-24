# Rowan Documentation

Use this page as the entrypoint for repository documentation.

## Architecture Review

- [`../CONTEXT.md`](../CONTEXT.md): Rowan domain language.
- [`architecture/README.md`](architecture/README.md): architecture document map and review rules.
- [`adr/`](adr/): accepted architecture decisions.
- [`architecture/module-map.md`](architecture/module-map.md): package Modules, Interfaces, Implementations, and Seams.
- [`architecture/deepening-opportunities.md`](architecture/deepening-opportunities.md): current architecture review candidates.

## Version Planning

- [`spec.md`](spec.md): current version spec entry point.
- [`prompt_plan.md`](prompt_plan.md): current prompt execution entry point.
- [`todo.md`](todo.md): cross-session checklist.
- [`version/README.md`](version/README.md): versioned planning index.
- [`version/0.4.6/`](version/0.4.6/): active release pack.
- [`version/0.4.5/`](version/0.4.5/): completed release pack.
- [`version/0.4.4/`](version/0.4.4/): completed release pack.
- [`PLAN/`](PLAN/): legacy planning tree and historical roadmap context.

## Rule Of Thumb

Architecture reviews should read `CONTEXT.md` and `docs/adr/` first. Version plans should describe when work happens, not redefine Rowan domain language or settled architecture decisions. New version work should start from `docs/spec.md`, `docs/prompt_plan.md`, and `docs/todo.md`.
