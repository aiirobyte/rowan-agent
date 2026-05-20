# Rowan v0.4.5 Todo

Last updated: 2026-05-21
Status: Planned

## Version Target

Target: v0.4.5 Phase-Configured Agent Loop.

Definition of done:

- [x] Create `docs/version/0.4.5/spec.md`.
- [x] Create `docs/version/0.4.5/prompt_plan.md`.
- [x] Create `docs/version/0.4.5/todo.md`.
- [x] Update root `docs/spec.md`, `docs/prompt_plan.md`, and `docs/todo.md`.
- [x] Update `docs/version/README.md` and `docs/README.md`.
- [ ] Add phase config contracts in `packages/agent/src/loop/phase-config.ts`.
- [ ] Refactor `packages/agent/src/loop/phases.ts` so `runPhase()` is the base runner for configured phases.
- [ ] Add built-in phase definitions in `packages/agent/src/loop/built-in-phases.ts`.
- [ ] Move route scheduling and direct answer decisions into the route phase definition.
- [ ] Move task creation into the plan phase definition.
- [ ] Move tool execution effects into the execute phase definition.
- [ ] Move verification, retry, and pass/fail outcome rules into the verify phase definition.
- [ ] Move thread route execution behind phase definition behavior using `runPhase()`'s phase-local `createRun` capability.
- [ ] Replace hard-coded loop status values with generic current phase state.
- [ ] Refactor `runAgentLoop()` into a generic phase-machine loop.
- [ ] Support configured/custom phase definitions in tests.
- [ ] Preserve default direct answer behavior.
- [ ] Preserve default task plan/execute/verify behavior.
- [ ] Preserve `verifyTasks: false` behavior through phase transitions.
- [ ] Preserve thread route and thread depth behavior.
- [ ] Preserve invalid execute/verify schema handling.
- [ ] Preserve tool event and tool-result message ordering.
- [ ] Update package READMEs and architecture docs.
- [ ] Run `bun test packages`.
- [ ] Run `bun run build`.
- [ ] Run `git diff --check`.
- [ ] Update root docs after v0.4.5 completion.

## Next Prompt

Start Prompt 1 from `docs/version/0.4.5/prompt_plan.md`: add phase config contracts and tests before rewriting the loop.

Expected next change:

- Create the phase config module under `packages/agent/src/loop/`.
- Add focused tests for config validation and a minimal custom phase graph.
- Keep current route/plan/execute/verify behavior unchanged until built-in phase definitions are in place.

## Guardrails

- Do not keep phase-specific control flow in `runAgentLoop()`.
- Do not make the loop branch on decision phase, execute phase, verify phase, or route values.
- Do not add a second phase runner beside the base `runPhase()` path.
- Do not keep a standalone nested-run/thread constructor outside `runPhase()`.
- Do not move Agent loop ownership into `packages/runtime`.
- Do not make runtime glue own route, plan, execute, verify, thread, retry, or outcome rules.
- Do not start v0.5.0 context projection or provider IR.
- Do not reintroduce durable persistence into the Agent loop.
- Do not add compatibility shims for the old hard-coded loop shape unless explicitly requested.

## Planning Notes

- 2026-05-21: User requested removing all phase-specific specializations from the loop. Specialization should live in phase definitions.
- 2026-05-21: User requested the loop stop distinguishing decision, execute, verify, or other phase kinds directly.
- 2026-05-21: User corrected the plan to keep only `runPhase()` as the base phase runner; do not add a second phase runner.
- 2026-05-21: User requested all phases be constructed from the base phase path, with specialization removed from the loop.
- 2026-05-21: User corrected nested/thread run construction: avoid a standalone nested thread helper and expose a shorter phase-local `createRun` capability through `runPhase()`.
- 2026-05-21: v0.4.5 is inserted before v0.5.0 so Context Projection And Provider IR can build on a phase-configured loop.
- Update this file after every meaningful coding session.
