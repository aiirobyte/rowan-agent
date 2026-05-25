# Rowan v0.4.7 Prompt Plan

Last updated: 2026-05-25
Status: Planned

## Version Target

Refactor the phase module so phase definitions are pure `input + context capabilities -> output` units. `runLoop()` owns runtime state, phase input construction, phase output application, lifecycle hooks, retries, and transitions. Built-in phases stay organized as extension-style modules under `packages/agent/src/loop/phases/built-in/<phase>/`.

## Prompts

### Prompt 0: Version Planning

Status: Complete

Goal: Create v0.4.7 version docs.

Expected next change:

1. Create `docs/version/0.4.7/spec.md`.
2. Create `docs/version/0.4.7/prompt_plan.md`.
3. Create `docs/version/0.4.7/todo.md`.
4. Update `docs/spec.md`.
5. Update `docs/prompt_plan.md`.
6. Update `docs/todo.md`.
7. Update `docs/version/README.md`.
8. Update `docs/README.md`.

Guardrails:

- Do not start implementation in Prompt 0.
- Do not mark v0.4.7 implementation items complete without fresh verification.

### Prompt 1: Lock Phase Boundary Tests

Status: Planned

Goal: Add failing tests that describe the new phase boundary before editing implementation.

Expected next change:

1. Update `packages/agent/test/run-configured-phase.test.ts` so the runner is called with an already-built input and returns output, not a transition.
2. Add tests for loop-owned phase input builders.
3. Add tests for loop-owned phase output appliers.
4. Add assertions that built-in phase modules do not require `AgentLoopRuntime` behavior.

Guardrails:

- Tests should fail against the current implementation.
- Do not rewrite production phase types in this prompt.
- Keep tests focused on phase/runtime boundary, not full feature behavior.

### Prompt 2: Narrow Phase Definition Types

Status: Planned

Goal: Change the phase contract so definitions no longer receive loop runtime or apply loop transitions.

Expected next change:

1. Modify `packages/agent/src/loop/phases/config.ts`.
2. Remove `buildInput(runtime)` from `PhaseDefinition`.
3. Remove `apply(runtime, output, input)` from `PhaseDefinition`.
4. Remove the `AgentLoopRuntime` import from `config.ts`.
5. Keep `id`, `name`, `description`, optional `modelPhase`, and `run(context, input)`.
6. Adjust `PhaseImplementation` to only describe phase-local behavior.

Guardrails:

- Do not add compatibility overloads for the old definition shape.
- Do not move loop transition logic into a renamed phase hook.

### Prompt 3: Add Context And Built-In Phase Extension Adapters

Status: Planned

Goal: Introduce the loop-owned layer around pure phase definitions while keeping built-in phase behavior co-located in `built-in/<phase>/`.

Expected next change:

1. Create `packages/agent/src/loop/phases/context.ts`.
2. Move model collection and tool execution behind `PhaseContext` capabilities.
3. Define a built-in phase extension shape with manifest, pure definition, input builder, and output applier.
4. Update `packages/agent/src/loop/phases/built-in/chat/index.ts` to export the chat extension.
5. Update `packages/agent/src/loop/phases/built-in/plan/index.ts` to export the plan extension.
6. Update `packages/agent/src/loop/phases/built-in/execute/index.ts` to export the execute extension.
7. Update `packages/agent/src/loop/phases/built-in/verify/index.ts` to export the verify extension.
8. Create `packages/agent/src/loop/phases/built-in/index.ts` as the built-in extension aggregation entrypoint.
9. Move `createBuiltinPhaseConfig()` and built-in extension composition out of `packages/agent/src/loop/phases/builtin-config.ts`.
10. Delete `packages/agent/src/loop/phases/builtin-config.ts` after the new aggregation entrypoint is wired.

Guardrails:

- Context exposes capabilities, not the whole runtime object.
- Input builders may read and update runtime state when the loop owns that update, such as execute attempt count.
- Output appliers are the only built-in phase extension layer allowed to mutate loop runtime or choose transitions.
- Do not create a separate phase runtime definition module for built-in behavior.
- Do not preserve template-to-implementation indirection once built-in phases are extension modules.
- `config.ts` remains generic; it must not import built-in manifests or built-in phase extensions.

### Prompt 4: Rename And Slim Phase Runner

Status: Planned

Goal: Replace `runConfiguredPhase()` with `runPhase()` and make it only invoke the configured phase mechanism.

Expected next change:

1. Move the runner into `packages/agent/src/loop/phases/phase.ts` or the existing phase entry module.
2. Change `runConfiguredPhase(runtime, definition, createRun)` to `runPhase(context, definition, input)`.
3. Return the phase output directly.
4. Remove transition construction from the phase runner.
5. Move `phase_start`/`phase_end` emission out to `runLoop()` or loop-owned helpers.
6. Move runtime `beforePhase`/`afterPhase` hooks out to `runLoop()` or loop-owned helpers.
7. Move retry counting out to `runLoop()` or loop-owned helpers.
8. Remove the old `runConfiguredPhase()` export instead of keeping a compatibility alias.

Guardrails:

- Keep one runner path.
- Do not introduce `runDefaultPhase()`.
- Do not let the runner know built-in phase IDs beyond metadata for logging.
- Do not keep old runner-name compatibility.

### Prompt 5: Refactor Built-In Phase Implementations

Status: Planned

Goal: Convert `chat`, `plan`, `execute`, and `verify` into pure phase definitions with local phase Rendering.

Expected next change:

1. `chat`: render its own prompt from `ChatInput` and `PhaseContext`, keep model collection and output parsing, but remove direct outcome creation and assistant-state mutation.
2. `plan`: render its own prompt from `PlanInput` and `PhaseContext`, return task output without mutating `runtime.currentTask`.
3. `execute`: render its own prompt from `ExecuteInput` and `PhaseContext`, use context tool capability, return execution output without choosing `verify` or stop.
4. `verify`: render its own prompt from `VerifyInput` and `PhaseContext`, return verification result without retry/stop decisions.
5. Remove imports from built-in phase modules to `../../../../loop`.
6. Delete `packages/agent/src/loop/phases/prompt-builder.ts` after each phase owns its Rendering.
7. Keep prompt manifests co-located with phase modules.

Guardrails:

- Phase modules may use `PhaseContext` capabilities.
- Phase modules must not mutate loop runtime directly.
- Phase modules must not return `PhaseTransition`.
- Phase-specific context-to-prompt Rendering belongs inside the phase extension, not in a shared loop prompt-builder module.

### Prompt 6: Wire runLoop To The New Runtime Boundary

Status: Planned

Goal: Make `runLoop()` the only owner of phase execution order and runtime mutation.

Expected next change:

1. Update `packages/agent/src/loop.ts`.
2. Build phase input before calling `runPhase()`.
3. Build `PhaseContext` before calling `runPhase()`.
4. Emit phase lifecycle events around the runner call.
5. Apply runtime hooks around the runner call.
6. Call output appliers after the runner returns.
7. Preserve stop, abort, next, retry, and max-attempt behavior.

Guardrails:

- Do not reintroduce phase-specific branches directly into the main loop body.
- Prefer loop-owned helper functions when built-in output application needs phase-specific behavior.
- Keep `runLoop()` readable as orchestration, not a pile of phase details.

### Prompt 7: Update Exports, Tests, And Documentation Notes

Status: Planned

Goal: Clean up references to the old phase definition shape.

Expected next change:

1. Update exports from `packages/agent/src/loop/phases/index.ts` and `phase.ts`.
2. Update tests that construct `PhaseDefinition`.
3. Update built-in phase tests to assert output behavior separately from runtime application.
4. Add a repository search check for old `runConfiguredPhase`, `buildInput(runtime)`, `apply(runtime`, and phase definition imports of `AgentLoopRuntime`.
5. Update v0.4.7 todo with implementation progress.

Guardrails:

- Only remove dead code created by this refactor.
- Do not widen into context projection, provider IR, replay, or eval work.
- Do not preserve old phase API or runner-name compatibility.

### Prompt 8: Verification And Handoff

Status: Planned

Goal: Verify the refactor and leave the version docs ready for the next session.

Expected next change:

1. Run `bun test packages/agent/test/phase-config.test.ts`.
2. Run `bun test packages/agent/test/run-configured-phase.test.ts`.
3. Run `bun test packages/agent/test/built-in-phases.test.ts`.
4. Run `bun test packages/agent/test/`.
5. Run `bun run build`.
6. Run `git diff --check`.
7. Update `docs/version/0.4.7/todo.md` with verification evidence.
8. Sync root `docs/todo.md` if implementation is completed.

Guardrails:

- Do not mark complete without fresh verification output.
- If a test fails, diagnose the boundary before changing the expected behavior.

## Completion Checklist

- [ ] Phase boundary tests fail first.
- [ ] `PhaseDefinition` has no `buildInput`.
- [ ] `PhaseDefinition` has no `apply`.
- [ ] `PhaseDefinition` has no `AgentLoopRuntime` reference.
- [ ] `PhaseContext` is a capability surface, not runtime exposure.
- [ ] Built-in phase extensions expose input builders.
- [ ] Built-in phase extensions expose output appliers.
- [ ] Built-in phase extensions own phase-specific Rendering.
- [ ] `builtin-config.ts` is removed or folded into `built-in/index.ts`.
- [ ] `prompt-builder.ts` is removed as a standalone phase module.
- [ ] `config.ts` remains generic and does not import built-ins.
- [ ] `runConfiguredPhase()` is removed.
- [ ] `runPhase()` returns phase output, not transition.
- [ ] Built-in phase definitions do not import `../../../../loop`.
- [ ] `runLoop()` owns transitions and runtime mutation.
- [ ] No old phase API compatibility shims remain.
- [ ] Direct chat, plan, execute, verify, retry, and max-attempt flows still work.
- [ ] `bun test packages/agent/test/` passes.
- [ ] `bun run build` passes.
- [ ] `git diff --check` passes.
