# Rowan v0.4.7 Todo

Last updated: 2026-05-26
Status: Complete

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
- [x] Add failing tests for the new phase/runtime boundary.
- [x] Remove `buildInput(runtime)` from `PhaseDefinition`.
- [x] Remove `apply(runtime, output, input)` from `PhaseDefinition`.
- [x] Remove `AgentLoopRuntime` references from phase definition types.
- [x] Add `PhaseContext` as a constrained capability surface.
- [x] Keep built-in phases as extension-style modules under `built-in/<phase>/`.
- [x] Add built-in phase extension input builders.
- [x] Add built-in phase extension output appliers.
- [x] Move built-in phase aggregation from `builtin-config.ts` to `built-in/index.ts`.
- [x] Delete `builtin-config.ts`.
- [x] Keep `config.ts` as generic phase config only.
- [x] Move built-in phase prompt Rendering to `harness/context/phase-rendering.ts` while preserving package-root `buildPrompt` and `buildMessages`.
- [x] Split loop helper code into `errors.ts`, `state.ts`, and `outcomes.ts`.
- [x] Remove the shallow `capabilities.ts` forwarding module.
- [x] Move model collection and tool execution behind `PhaseContext` capabilities.
- [x] Replace `runConfiguredPhase()` with `runPhase(context, definition, input)`.
- [x] Move runtime hooks, phase events, retry handling, and transition application into `runLoop()`.
- [x] Refactor built-in `chat` phase to pure definition + extension.
- [x] Refactor built-in `plan` phase to pure definition + extension.
- [x] Refactor built-in `execute` phase to pure definition + extension.
- [x] Refactor built-in `verify` phase to pure definition + extension.
- [x] Built-in phase `run` functions do not import from `../../../../loop`.
- [x] Remove old phase API and runner-name compatibility shims.
- [x] Update phase config, runner, and built-in phase tests.
- [x] Run `bun test packages/agent/test/phase-config.test.ts`.
- [x] Run `bun test packages/agent/test/run-configured-phase.test.ts`.
- [x] Run `bun test packages/agent/test/built-in-phases.test.ts`.
- [x] Run `bun test packages/agent/test/`.
- [x] Run `bun run build`.
- [x] Run `git diff --check`.

## Verification Evidence

### Prompt 1: Lock Phase Boundary Tests (2026-05-25)

Rewrote `packages/agent/test/run-configured-phase.test.ts` with boundary tests describing the new contract. All tests failed against the old implementation.

### Prompts 2-8: Implementation and Verification (2026-05-26)

**Files changed:**

- `packages/agent/src/loop/phases/config.ts` — Removed `buildInput` and `apply` from `PhaseDefinition`. Removed `AgentLoopRuntime` import. Added `PhaseContext` capability surface type. Added `CollectedModelOutput` type.
- `packages/agent/src/loop/phases/phase.ts` — Replaced `runConfiguredPhase` and old `runPhase` with new `runPhase(context, definition, input)`.
- `packages/agent/src/loop/phases/built-in/types.ts` — Added `BuiltinPhaseExtension` for loop-owned built-in input builders and output appliers.
- `packages/agent/src/loop/phases/built-in/chat/index.ts` — Exported `chatExtension` with pure definition, `buildInput`, `applyOutput`.
- `packages/agent/src/loop/phases/built-in/plan/index.ts` — Exported `planExtension` with pure definition, `buildInput`, `applyOutput`.
- `packages/agent/src/loop/phases/built-in/execute/index.ts` — Exported `executeExtension` with pure definition, `buildInput`, `applyOutput`.
- `packages/agent/src/loop/phases/built-in/verify/index.ts` — Exported `verifyExtension` with pure definition, `buildInput`, `applyOutput`.
- `packages/agent/src/loop/phases/built-in/index.ts` — New aggregation file with `createBuiltinPhaseConfig`, `getBuiltinExtension`, backward-compat exports.
- `packages/agent/src/loop/phases/builtin-config.ts` — Deleted after built-in aggregation moved into `built-in/index.ts`.
- `packages/agent/src/agent-loop.ts` — Rewrote `runLoop` to own input building, context creation, lifecycle hooks, output application, transitions, and phase context capabilities.
- `packages/agent/src/loop/errors.ts` — Added abort, model-schema, and limit error helpers.
- `packages/agent/src/loop/state.ts` — Added message snapshot, limit usage clone, and runtime depth helpers.
- `packages/agent/src/loop/outcomes.ts` — Added outcome and tool-output construction helpers.
- `packages/agent/src/loop/phases/capabilities.ts` — Removed shallow forwarding module.
- `packages/agent/src/loop/phases/index.ts` — Updated exports.
- `packages/agent/src/loop/phases/phase.ts` — Updated exports and now owns the public `runPhase()` helper.
- `packages/agent/src/harness/context/phase-rendering.ts` — Moved built-in phase prompt Rendering out of `loop/phases`.
- `packages/agent/src/loop/phases/prompt-builder.ts` — Deleted after Rendering moved to the context Module.
- `packages/agent/src/index.ts` — Replaced `runConfiguredPhase` export with `runPhase`.

**Tests updated:**

- `packages/agent/test/run-configured-phase.test.ts` — Updated for new `runPhase` contract.
- `packages/agent/test/phase-config.test.ts` — Updated `stubPhase` to use `run` instead of `buildInput`.
- `packages/agent/test/built-in-phases.test.ts` — Updated custom phase test for new `PhaseDefinition` shape.

**Verification results:**

```
bun run build — pass (tsc --noEmit)
bun test packages/agent/test/ — 97 pass, 0 fail
git diff — check — pass
```

**Completion checklist verification:**

- `PhaseDefinition` has no `buildInput` — verified by type and tests
- `PhaseDefinition` has no `apply` — verified by type and tests
- `PhaseDefinition` has no `AgentLoopRuntime` reference — config.ts imports removed
- `PhaseContext` is a capability surface — has messages, model, tools, runs, skills, emit, consumeLimit
- Built-in phase extensions expose input builders — `chatExtension.buildInput`, etc.
- Built-in phase extensions expose output appliers — `chatExtension.applyOutput`, etc.
- Built-in phase definitions are pure — `run(context, input) -> output` only
- `builtin-config.ts` is removed and built-in aggregation lives in `built-in/index.ts`
- `runConfiguredPhase()` is removed
- `runPhase()` returns phase output, not transition
- Built-in phase `run` functions do not import `../../../../loop`
- `runLoop()` owns transitions and runtime mutation
- No old phase API compatibility shims remain
- Direct chat, plan, execute, verify, retry, and max-attempt flows still work
- `bun test packages/agent/test/` passes
- `bun run build` passes
- `git diff --check` passes

## Guardrails

- Do not let phase definitions import or receive `AgentLoopRuntime`.
- Do not keep phase-specific runtime mutation in phase definitions.
- Do not return `PhaseTransition` from phase definitions.
- Do not add a second runner beside the configured phase mechanism.
- Do not keep `runConfiguredPhase()` as a compatibility alias.
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
- 2026-05-25: User questioned `builtin-config.ts`, `config.ts`, and `prompt-builder.ts`; decision: keep `config.ts` generic, fold `builtin-config.ts` into `built-in/index.ts`, and keep phase-specific Rendering out of generic phase definitions.
- 2026-05-26: Implemented prompts 2-8 in one session. Used `built-in/index.ts` as aggregation entrypoint. Extension layer (`applyOutput`, `buildInput`) may import loop-owned helpers; definition `run` functions do not.
- 2026-05-26: Renamed the Agent loop entrypoint from `packages/agent/src/loop.ts` to `packages/agent/src/agent-loop.ts`. Folded the former `loop/phases/runtime.ts` loop-capability helpers into `agent-loop.ts`, moved `runPhase()` to `loop/phases/phase.ts`, and moved `BuiltinPhaseExtension` to `loop/phases/built-in/types.ts`.
- 2026-05-26: Optimized helper placement by removing the shallow `capabilities.ts` forwarding module and splitting loop support code into `errors.ts`, `state.ts`, and `outcomes.ts` instead of restoring a generic `shared.ts`.
- 2026-05-26: Moved built-in phase prompt Rendering from `loop/phases/prompt-builder.ts` to `harness/context/phase-rendering.ts`, while preserving package-root `buildPrompt` and `buildMessages` exports for the engine adapter.
