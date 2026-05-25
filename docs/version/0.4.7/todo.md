# Rowan v0.4.7 Todo

Last updated: 2026-05-25
Status: Planned

## Version Target

Target: v0.4.7 Phase Definition Runtime Boundary.

Definition of done:

- [x] Create `docs/version/0.4.7/spec.md`.
- [x] Create `docs/version/0.4.7/prompt_plan.md`.
- [x] Create `docs/version/0.4.7/todo.md`.
- [x] Update `docs/spec.md`.
- [x] Update `docs/prompt_plan.md`.
- [x] Update `docs/todo.md`.
- [x] Update `docs/version/README.md`.
- [x] Update `docs/README.md`.
- [ ] Add failing tests for the new phase/runtime boundary.
- [ ] Remove `buildInput(runtime)` from `PhaseDefinition`.
- [ ] Remove `apply(runtime, output, input)` from `PhaseDefinition`.
- [ ] Remove `AgentLoopRuntime` references from phase definition types.
- [ ] Add `PhaseContext` as a constrained capability surface.
- [ ] Keep built-in phases as extension-style modules under `built-in/<phase>/`.
- [ ] Add built-in phase extension input builders.
- [ ] Add built-in phase extension output appliers.
- [ ] Move built-in phase aggregation from `builtin-config.ts` to `built-in/index.ts`.
- [ ] Delete `builtin-config.ts` after the extension aggregation entrypoint is wired.
- [ ] Keep `config.ts` as generic phase config validation only.
- [ ] Move phase-specific Rendering into each built-in phase extension.
- [ ] Delete `prompt-builder.ts` as a standalone phase module.
- [ ] Move model collection and tool execution behind `PhaseContext` capabilities.
- [ ] Replace `runConfiguredPhase()` with `runPhase(context, definition, input)`.
- [ ] Move runtime hooks, phase events, retry handling, and transition application into loop-owned helpers.
- [ ] Refactor built-in `chat` phase to return output only.
- [ ] Refactor built-in `plan` phase to return output only.
- [ ] Refactor built-in `execute` phase to return output only.
- [ ] Refactor built-in `verify` phase to return output only.
- [ ] Remove built-in phase definition imports of `../../../../loop`.
- [ ] Remove old phase API and runner-name compatibility shims.
- [ ] Update phase config, runner, and built-in phase tests.
- [ ] Run `bun test packages/agent/test/phase-config.test.ts`.
- [ ] Run `bun test packages/agent/test/run-configured-phase.test.ts`.
- [ ] Run `bun test packages/agent/test/built-in-phases.test.ts`.
- [ ] Run `bun test packages/agent/test/`.
- [ ] Run `bun run build`.
- [ ] Run `git diff --check`.

## Verification Evidence

(To be filled after implementation)

## Next Prompt

v0.4.7 implementation starts with Prompt 1: Lock Phase Boundary Tests.

## Guardrails

- Do not let phase definitions import or receive `AgentLoopRuntime`.
- Do not keep phase-specific runtime mutation in phase definitions.
- Do not return `PhaseTransition` from phase definitions.
- Do not add a second runner beside the configured phase mechanism.
- Do not keep `runConfiguredPhase()` as a compatibility alias.
- Do not keep `builtin-config.ts` as a pass-through built-in assembly module.
- Do not keep phase-specific Rendering in a shared `loop/phases/prompt-builder.ts`.
- Do not reintroduce hard-coded `plan → execute → verify` branches in the main loop body.
- Do not make thread a phase or a tool.
- Do not start v0.5.0 context projection or provider IR.
- Do not change durable SessionManager storage.

## Planning Notes

- 2026-05-25: User requested v0.4.7 to refactor the phase module around `runLoop -> context/messages/phase input -> configured default phase -> phase definition -> phase output -> runLoop`.
- 2026-05-25: User clarified that phase definitions should accept input, use context capabilities such as tools, threads, skills, and messages, then output the declared phase output.
- 2026-05-25: User clarified that phase definitions should not own loop execution; the runtime belongs to `runLoop`.
- 2026-05-25: Current code inspection found `PhaseDefinition.buildInput(runtime)`, `PhaseDefinition.apply(runtime, ...)`, and built-in phase imports of loop runtime helpers as the main boundary leaks to remove.
- 2026-05-25: User corrected v0.4.7 planning: built-in phases should follow an extension-style layout under `built-in/`, phase runtime definitions should be removed, `runConfiguredPhase()` should become `runPhase()`, and no old compatibility is needed.
- 2026-05-25: User questioned `builtin-config.ts`, `config.ts`, and `prompt-builder.ts`; decision: keep `config.ts` generic, fold `builtin-config.ts` into `built-in/index.ts`, and move phase-specific Rendering out of shared `prompt-builder.ts` into each phase extension.
- Update this file after every meaningful coding session.
