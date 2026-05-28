# Rowan v0.4.8 Todo

Last updated: 2026-05-28
Status: Complete

## Version Target

Target: v0.4.8 Lifecycle Unification.

Definition of done:

- [ ] Create `docs/version/0.4.8/spec.md`.
- [ ] Create `docs/version/0.4.8/prompt_plan.md`.
- [ ] Create `docs/version/0.4.8/todo.md`.
- [ ] Update `docs/spec.md`.
- [ ] Update `docs/prompt_plan.md`.
- [ ] Update `docs/todo.md`.
- [ ] Update `docs/version/README.md`.
- [ ] Update `docs/README.md`.

## Prompt 1: Unified Phase Types And Event Renaming

- [x] Add `PhaseInput` type to `config.ts`.
- [x] Add `PhaseOutput` type to `protocol/context.ts`.
- [x] Remove `LoopPhaseOutputMap`, `PhaseOutputMap`, `PhaseInputMap`, `ExecuteOutput`.
- [x] Rename `chat_start` to `turn_start` in `AgentEvent`.
- [x] Rename `chat_end` to `turn_end` in `AgentEvent`.
- [x] Rename `emitChat` to `emitTurn` in `agent-loop.ts`.
- [x] Update tests for new event names.

## Prompt 2: PhaseHandler Interface Simplification

- [x] Remove `applyOutput` from `PhaseHandler`.
- [x] Add `createOutcome` to `PhaseHandler` (optional).
- [x] Remove generic type parameters from `PhaseHandler`.
- [x] Update `buildInput` signature to `(context, yield?)`.
- [x] Update `buildPrompt` signature to `(input: PhaseInput)`.
- [x] Update `finalize` signature to `(context, output: PhaseOutput)`.

## Prompt 3: PhaseContext Lifecycle Managers

- [x] Add `PhaseMessageManager` type to `config.ts`.
- [x] Add `PhaseToolExecutionManager` type to `config.ts`.
- [x] Add `message` and `toolExecution` to `PhaseContext`.
- [x] Implement message manager in `createPhaseContext`.
- [x] Implement toolExecution manager in `createPhaseContext`.
- [x] `appendMessage` removes auto event emission.
- [x] `collectTextAndStructured` uses `PhaseContext.message`.
- [x] `executeToolCall` removes `observe` callback.

## Prompt 4: Convert Built-In Phase Outputs

- [x] Chat phase returns `{ message, route }`.
- [x] Chat phase has `createOutcome`.
- [x] Plan phase returns `{ message, route, yield: { task } }`.
- [x] Plan phase finalize sets task from yield.
- [x] Execute phase returns `{ message, route, yield: { toolResults } }`.
- [x] Execute phase uses `context.toolExecution`.
- [x] Execute phase uses `context.message` for tool results.
- [x] Execute phase route from model output.
- [x] Verify phase returns `{ message, route }`.
- [x] Verify phase has `createOutcome`.
- [x] Verify phase reads toolResults from `input.yield`.

## Prompt 5: Main Loop Unified Routing

- [x] Main loop reads `output.route` for transitions.
- [x] Remove `applyOutput` calls from main loop.
- [x] `lastYield` passed between phases.
- [x] Generic `phaseVisits` limit.
- [x] `createOutcome` called on `route === "stop"`.
- [x] Remove `PhaseTransition` from main loop (deprecated).

## Prompt 6: AgentState Cleanup

- [x] Remove `task` from `AgentState`.
- [x] Remove `goal` from `AgentState`.
- [x] Remove `task`/`goal` from `CreateAgentStateInput`.
- [x] Remove `task`/`goal` from `emitTurn` metadata.
- [x] Remove `task`/`goal` from `createRunResult`.
- [x] Remove `task`/`goal` from `AgentThreadRunConfig`, `AgentRunResult`, `AgentEvent`.
- [x] Remove `task`/`goal` from session types (`Session`, `SessionHeader`, `CreateSessionManagerInput`, `PersistedSessionSchema`).
- [x] Remove `task`/`goal` from `RuntimeThreadInput`, `AgentContextState`.
- [x] Chat phase gets worker context from yield (already done).
- [x] Thread creation passes task/goal through config (removed — threads no longer carry string task/goal metadata).

## Prompt 7: LlmContext Removal

- [x] Remove `LlmContext` union type from `protocol/context.ts`.
- [x] `buildPrompt` takes `PhaseInput`.
- [x] Chat `buildPrompt` extracts from input.
- [x] Plan `buildPrompt` extracts from input.
- [x] Execute `buildPrompt` extracts from input.yield.
- [x] Verify `buildPrompt` extracts from input.yield.
- [x] `model.collect` accepts `PhaseInput` directly.

## Prompt 8: Tests, Verification, And Cleanup

- [x] Update `agent-loop.test.ts`.
- [x] Update `agent-multiturn.test.ts`.
- [x] Update `thread.test.ts`.
- [x] Update `cli-real-model.test.ts` (pre-existing failures unrelated to refactor — 10 CLI integration tests fail on clean tree).
- [x] Update `pino-logger.test.ts` (already using correct event names).
- [x] Remove dead code (`PhaseTransition` type removed).
- [x] Search for stale references (none found).
- [x] Update `session-store.test.ts` for removed task/goal fields.
- [x] `bun test packages/agent/test/` passes (96 tests).
- [x] `bun run build` passes.
- [x] `git diff --check` passes.

## Guardrails

- Do not let phase definitions contain routing logic.
- Do not let `appendMessage` emit lifecycle events.
- Do not put phase-specific data in `AgentState`.
- Do not keep `applyOutput` as a compatibility shim.
- Do not keep `LlmContext` union type.
- Do not change phase prompt content (only input shape).
- Do not break thread creation.
- Do not start v0.5.0 context projection or provider IR.

## Planning Notes

- 2026-05-28: User requested lifecycle refactoring to align with pi's turn model.
- 2026-05-28: Key insight: all phases should have unified input/output, model decides routing via `route`.
- 2026-05-28: `task`/`goal` should flow through `yield`, not live in `AgentState`.
- 2026-05-28: `PhaseInput` should be explicitly constructed by each phase's `buildInput`, giving phases control over model input.
- 2026-05-28: Execute phase route should be decided by the model (unified), not by `toolCalls.length` (exception).
- 2026-05-28: Phase-specific data (task, toolResults) flows through `yield` field between phases.
- 2026-05-28: `chat_start`/`chat_end` renamed to `turn_start`/`turn_end` to align with pi.
- 2026-05-28: Completed pure yield flow — removed `task`/`toolResults` from `AgentRunState`, `currentTask`/`toolResults` from `AgentLoopRuntime`, `setTask` from `PhaseContext`. Task flows exclusively through `yield` between plan → execute → verify.
- 2026-05-28: Execute route fallback fixed — removed `toolCalls.length` fallback, model decides route with "verify" as default.
- 2026-05-28: Execute handler catches `LimitExceededError` to preserve task in yield on limit errors.
- 2026-05-28: All 96 agent tests pass, build clean.
