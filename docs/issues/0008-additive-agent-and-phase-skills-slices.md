# Issue drafts: Layered Agent and Phase Skills

Status: Implemented locally. Do not publish to GitHub without a separate
request.

Source: [PRD-0008](../prd/0008-additive-agent-and-phase-skills.md)

Decision: [ADR-0009](../adr/0009-additive-agent-and-phase-skills.md)

## Slice 1: Phase context

Use public Runtime tests to merge root and Phase Skills in serial and parallel
execution, with Phase Skills replacing same-name root values.

## Slice 2: Parent Definition Skills

Carry host-supplied `bundledSkills` through Definition resolution and
snapshotting, then merge them after selected Scope Skills with same-name
replacement.

## Slice 3: Verification

Run focused tests, typecheck, build, and public interface verification.
