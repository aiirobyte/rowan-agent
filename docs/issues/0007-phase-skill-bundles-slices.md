# Issue drafts: Direct Skill Bundles for File Phases

Status: Implemented locally through Slice 4; Slice 5 is a cross-repository
handoff. Do not publish to GitHub without a separate request.

Source: [PRD-0007](../prd/0007-phase-skill-bundles.md)

Decision: [ADR-0008](../adr/0008-phase-skill-bundles.md)

Each slice follows one red → green cycle through a public Rowan seam.

## Progress (recorded after the fact, 2026-09-24)

Seam-level audit: Slices 1-4 landed — `harness/phases/loader.ts` (`loadPhase` /
`loadPhaseSkills` reading a Phase as a bundle), the serial and parallel loop paths
merging `phase.skills` (`loop/runners.ts`), Directory Extension Phase
registration (`extensions/runner.ts`, `extensions/types.ts`), and the frozen
bundle in the configuration snapshot (`config-provider.ts:snapshotPhase`).
Tests: `test/harness/resource-loading.test.ts`,
`test/runtime/phase-normalization.test.ts`, `test/phase-config.test.ts`,
`test/extensions-loader.test.ts`.
Slice 5 is the pack-and-verify handoff to Mori, which is outside this
repository; its stated 0.9.0 target has moved on since.

## Dependency map

```text
1 Bundle loader ─> 2 Phase runtime context ─> 3 Extension registration
                 └─────────────────────────> 4 Snapshot/public contract
1–4 ────────────────────────────────────────> 5 Release verification
```

## Slice 1: Load direct Skills as a Phase Bundle

Change file `loadPhase` and the Phase value shape to include direct child
Skills. Keep `loadSkills` shallow and add strict marker/depth/duplicate checks.

Acceptance:

- A fixture Phase returns its direct Skills and execution code.
- Nested or wrong-kind markers invalidate the parent; no partial Bundle is
  returned.
- Non-marker attachments remain legal and inline Phases remain empty-Skill.
- Existing top-level Skill loading remains direct-only.

## Slice 2: Replace active Phase Skills in every loop path

Update serial, parallel, factory, input-resume, checkpoint, route, and reload
paths to use concrete Phase Bundle Skills. Deep-freeze Bundle values at the
configuration seam.

Acceptance:

- Default shows selected Scope Skills.
- File Phase shows only direct child Skills.
- Returning to default restores Scope Skills.
- Route metadata omits nested Skill names before entry.
- Source replacement affects later Runs only.

## Slice 3: Directory Extension Phase registration

Add async directory registration and delegate to the shared Bundle loader.
Remove the Extension Phase Skill-name selector and keep code-only inline values
empty-Skill.

Acceptance:

- Extension directory code and child Skills use normal Phase execution.
- Invalid/duplicate Bundle activation rolls back all of that Extension's
  contributions.
- Existing Extension lifetime, source collision, and disposal tests remain
  green.

## Slice 4: Public contract and release

Update exported types, validators, public interface tests, docs, fixtures, and
package metadata for Rowan `0.9.0`.

Acceptance:

- No file Phase path treats `skills` as a global name selector.
- Full tests, typecheck, build, interface check, and local package packing pass.

## Slice 5: Cross-repository verification handoff

Pack Rowan locally, point a clean Mori install check at the packed
artifact, and verify the new Phase Bundle contract before Mori changes.

Acceptance:

- The packed `0.9.0` artifact exposes the intended loader/types.
- No absolute or cross-repository path dependency is committed.
