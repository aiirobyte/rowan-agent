# Issue slices: Host-declared core resources and Phase controls

Status: ready-for-agent. Do not publish to GitHub, tag, or push without a
separate request.

Decision: [ADR-0016](../adr/0016-host-core-resources-and-phase-controls.md)

## Slices

| Slice | Scope | Verification |
| --- | --- | --- |
| R1 Host-declared core | A host-loaded Phase or Tool value with `core: true` is selected despite an empty or narrower `phaseIds` / `tools`, a Definition Layer, and Phase `tools` filters; loaders ignore `core` in frontmatter; host replacement of Rowan core names is unchanged | Selection tests through `loadPhases` / `loadTools` and a Configuration Snapshot |
| R2 `previous` and `prompt-guidelines` | Reserved `previous` route target (registry rejects the name; route tool lists it; runner returns to the latest `from` Phase, else stop; `target: previous`); PHASE.md `prompt-guidelines` parsed, kept on `Phase`, merged into System Prompt Guidelines for Phases in the route catalog | Runner tests a → b → previous returns to a; entry-Phase previous stops; prompt text includes and de-duplicates guidelines; a removed Phase drops them |
| R3 Control Phase Run | `runPhase` on the durable runtime; `kind: "phase"` metadata; entry Phase and payload; hidden outcome; `yieldToInput` cancellation; `compact()` and auto-compaction move onto it; the `kind: "compact"` path is removed | Durable tests: system-triggered Phase Run adds no user message and is not displayed; yield cancels on a new ordinary Run; compaction tests unchanged in behaviour |
| Docs and version | CONTEXT.md entries (Core Resource, Control Phase Run, reserved route targets); README if it lists route targets; bump `@rowan-agent/agent` minor | `bun run build`; `bun run test` |

## Acceptance

One commit per slice, then a docs/version commit. Full workspace build and
tests pass. No publish, tag, or push.
