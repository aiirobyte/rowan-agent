# Rowan v0.4.3 Todo

Last updated: 2026-05-13
Status: Complete

## Version Target

Target: v0.4.3 Agent Loop Package Boundary Consolidation.

Definition of done:

- [x] Create `docs/version/0.4.3/spec.md`.
- [x] Create `docs/version/0.4.3/prompt_plan.md`.
- [x] Create `docs/version/0.4.3/todo.md`.
- [x] Create root `docs/spec.md`, `docs/prompt_plan.md`, and `docs/todo.md`.
- [x] Create `docs/version/README.md`.
- [x] Update docs navigation for the new planning format.
- [x] Move shared phase output contracts into `protocol`.
- [x] Add typed phase-output stream events or equivalent contracts.
- [x] Preserve `StreamFn` compatibility where needed during migration.
- [x] Update OpenAI-compatible adapter typed phase output.
- [x] Keep provider schema and JSON extraction errors in adapters.
- [x] Add adapter tests for typed phase outputs.
- [x] Add runtime event-neutral tool execution primitive.
- [x] Move default tool argument validation to runtime.
- [x] Cache compiled tool schema validators when applicable.
- [x] Preserve before/after tool hook behavior.
- [x] Replace Agent-local provider output parsing where typed adapter output is available.
- [x] Use runtime tool execution primitive from Agent loop.
- [x] Keep Agent-owned lifecycle, effects, and outcomes in `agent`.
- [x] Avoid new Agent-local `runtime.ts` and `model-stream.ts` files.
- [x] Update package boundary tests.
- [x] Preserve Agent behavior tests.
- [x] Add runtime tool execution tests.
- [x] Run `bun test packages`.
- [x] Run `bun run build`.
- [x] Update root docs after v0.4.3 completion.

## Next Prompt

v0.4.3 is complete. Next version handoff: prepare v0.5.0 Context Projection And Provider IR planning before starting implementation.

Expected next change:

- Create `docs/version/0.5.0/` planning docs from the roadmap context before implementing context projection or provider IR.

## Verification

- 2026-05-13: `bun test packages` passed with 141 tests.
- 2026-05-13: `bun run build` passed.

## Guardrails

- Do not make `agent` import `adapters`.
- Do not move route / plan / execute / verify ordering into `runtime`.
- Do not add `packages/agent/src/runtime.ts`.
- Do not add `packages/agent/src/model-stream.ts`.
- Do not start context projection or provider-neutral `ConversationEntry[]` in this version.
- Do not add public compatibility shims unless explicitly requested.

## Planning Notes

- 2026-05-13: Planning format changed to the allmone-style versioned docs layout. New and resumed version work should start from root `docs/spec.md`, `docs/prompt_plan.md`, `docs/todo.md`, then the active files under `docs/version/<semver>/`.
- 2026-05-13: `docs/PLAN/` is retained as a legacy release-planning tree and historical source, not the default entry point for new version work.
- 2026-05-13: v0.4.3 implementation completed. `protocol` owns typed phase output contracts, `adapters` emits typed `phase_output` events, `runtime` owns event-neutral tool execution, and `agent` preserves loop ordering/effects/outcomes.
- Update this file after every meaningful coding session.
