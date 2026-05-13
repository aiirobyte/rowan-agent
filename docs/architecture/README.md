# Rowan Architecture Docs

This directory is the stable architecture layer for Rowan. Release plans live in `docs/PLAN/`; architecture reviews should start here instead of mining version notes.

## Read Order

1. `CONTEXT.md`: Rowan domain language.
2. `docs/adr/`: architecture decisions that should not be re-litigated without new pressure.
3. `docs/architecture/module-map.md`: current package Modules, Interfaces, Implementations, and Seams.
4. `docs/architecture/deepening-opportunities.md`: candidate refactors from architecture review.
5. `docs/architecture/pi-recording-persistence.md`: Pi comparison for recording and persistence ownership.
6. `docs/PLAN/INDEX.md`: version timeline and implementation tasks.

## Rules For Architecture Reviews

- Use the domain terms from `CONTEXT.md`.
- Use the architecture vocabulary from `improve-codebase-architecture`: Module, Interface, Implementation, Depth, Seam, Adapter, Leverage, and Locality.
- Check `docs/adr/` before proposing a change that might contradict an existing package ownership or storage decision.
- Record reusable review findings in `deepening-opportunities.md`.
- When a candidate introduces a new Rowan domain term, update `CONTEXT.md`.
- When a rejected candidate has a load-bearing reason, record an ADR.

## Document Roles

- `CONTEXT.md` names Rowan concepts.
- `docs/adr/` records decisions.
- `docs/architecture/` describes current architecture and review candidates.
- `docs/PLAN/` describes versioned implementation plans.
