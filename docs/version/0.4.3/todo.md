# Rowan v0.4.3 Todo

Last updated: 2026-05-13
Status: Planned

## Version Target

Target: v0.4.3 Agent Loop Package Boundary Consolidation.

Definition of done:

- [x] Create `docs/version/0.4.3/spec.md`.
- [x] Create `docs/version/0.4.3/prompt_plan.md`.
- [x] Create `docs/version/0.4.3/todo.md`.
- [x] Create root `docs/spec.md`, `docs/prompt_plan.md`, and `docs/todo.md`.
- [x] Create `docs/version/README.md`.
- [x] Update docs navigation for the new planning format.
- [ ] Move shared phase output contracts into `protocol`.
- [ ] Add typed phase-output stream events or equivalent contracts.
- [ ] Preserve `StreamFn` compatibility where needed during migration.
- [ ] Update OpenAI-compatible adapter typed phase output.
- [ ] Keep provider schema and JSON extraction errors in adapters.
- [ ] Add adapter tests for typed phase outputs.
- [ ] Add runtime event-neutral tool execution primitive.
- [ ] Move default tool argument validation to runtime.
- [ ] Cache compiled tool schema validators when applicable.
- [ ] Preserve before/after tool hook behavior.
- [ ] Replace Agent-local provider output parsing where typed adapter output is available.
- [ ] Use runtime tool execution primitive from Agent loop.
- [ ] Keep Agent-owned lifecycle, effects, and outcomes in `agent`.
- [ ] Avoid new Agent-local `runtime.ts` and `model-stream.ts` files.
- [ ] Update package boundary tests.
- [ ] Preserve Agent behavior tests.
- [ ] Add runtime tool execution tests.
- [ ] Run `bun test packages`.
- [ ] Run `bun run build`.
- [ ] Update root docs after v0.4.3 completion.

## Next Prompt

Start v0.4.3 Prompt 1: Protocol Phase Output Contracts.

Expected next change:

- Move only shared phase output contracts into `packages/protocol/src`, then update imports and verify that consumers no longer depend on Agent-private types for cross-package phase output.

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
- Update this file after every meaningful coding session.
