# Structured Context Agent Definitions issue slices

Status: Approved local execution plan. No GitHub Issues have been created.

Source: [PRD-0005](../prd/0005-structured-context-agent-definitions.md)

Decision: [ADR-0006](../adr/0006-structured-context-agent-definitions.md)

Each slice follows one red → green cycle through a public Rowan seam.

## Slice 1: Parse Context and PhaseRegistry Definition fields

At the exported Definition parser seam, add Context lists and the
PhaseRegistry selection object, rejecting top-level `entryPhase` and legacy
Phase string arrays.

Acceptance:

- Tests prove omitted/empty/named Context semantics, strict object shape,
  null entry behavior, deduplication, and legacy rejection.

## Slice 2: Resolve structured Context into System Prompt assembly

At the resolved Agent Context/System Prompt seam, select generic Context
Candidates and format them with the existing XML utilities.

Acceptance:

- Tests prove exact generic structure, escaping, missing-name warnings,
  duplicate rejection, and no business-name branching.

## Slice 3: Resolve PhaseRegistry selections after Extensions

At the Extension assembly seam, apply Definition PhaseRegistry membership and
entry selection after ordinary and Extension candidate phases are assembled.

Acceptance:

- Tests prove inherited registries, explicit empty selection, entry fallback,
  explicit null/default, and Extension-provided Phase selection.

## Slice 4: Preserve public configuration and snapshots

At AgentRuntime and ConfigProvider seams, migrate internal fixtures and prove
that Context and PhaseRegistry selections survive configuration identity,
reconstruction, and Input Request continuation.

Acceptance:

- Public declarations expose the new contract only; no legacy Phase fields
  remain.
- Focused tests, package typecheck, build, public-interface checks, and diff
  checks pass.
