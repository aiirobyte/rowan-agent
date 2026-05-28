# Rowan v0.4.8 Prompt Plan

Last updated: 2026-05-28
Status: Planned

## Version Target

Refactor the Agent loop lifecycle: unified phase input/output with `yield`, model-driven routing via `route`, streaming message/tool lifecycles, event renaming to align with pi's turn model, and AgentState cleanup.

## Prompts

### Prompt 0: Version Planning

Status: Complete

Goal: Create v0.4.8 version docs.

Expected next change:

1. Create `docs/version/0.4.8/spec.md`.
2. Create `docs/version/0.4.8/prompt_plan.md`.
3. Create `docs/version/0.4.8/todo.md`.
4. Update `docs/spec.md`.
5. Update `docs/prompt_plan.md`.
6. Update `docs/todo.md`.
7. Update `docs/version/README.md`.
8. Update `docs/README.md`.

Guardrails:

- Do not start implementation in Prompt 0.
- Do not mark v0.4.8 implementation items complete without fresh verification.

### Prompt 1: Unified Phase Types And Event Renaming

Status: Complete

Goal: Establish the unified PhaseInput/PhaseOutput types and rename events. This is the foundation for all subsequent work.

Expected next change:

1. Add `PhaseInput` type to `packages/agent/src/loop/phases/config.ts`:
   - `systemPrompt: string`
   - `messages: AgentMessage[]`
   - `tools: Tool[]`
   - `skills: Skill[]`
   - `yield?: unknown`
2. Add `PhaseOutput` type to `packages/agent/src/protocol/context.ts`:
   - `message: string`
   - `route: string`
   - `yield?: unknown`
3. Remove `LoopPhaseOutputMap`, `PhaseOutputMap`, `PhaseInputMap`, `ExecuteOutput` from `packages/agent/src/loop/types.ts`.
4. In `packages/agent/src/types.ts`: rename `chat_start` to `turn_start`, `chat_end` to `turn_end` in `AgentEvent`.
5. In `packages/agent/src/agent-loop.ts`: rename `emitChat` to `emitTurn`, update all call sites.
6. Update all tests referencing `chat_start`/`chat_end`.

Guardrails:

- Do not change phase implementations yet.
- Do not change the main loop logic yet.
- Keep old `applyOutput` working temporarily.
- Tests should still pass with old phase outputs after event renaming.

### Prompt 2: PhaseHandler Interface Simplification

Status: Complete

Goal: Simplify PhaseHandler by removing `applyOutput` and adding `createOutcome`.

Expected next change:

1. In `packages/agent/src/loop/phases/built-in/types.ts`:
   - Remove `applyOutput` from `PhaseHandler`.
   - Add optional `createOutcome(output: PhaseOutput, state: AgentRunState): Outcome`.
   - Remove generic type parameters from `PhaseHandler`.
   - Change `buildInput` signature to `(context: PhaseContext, yield?: unknown): PhaseInput`.
   - Change `buildPrompt` signature to `(input: PhaseInput): string`.
   - Change `finalize` signature to `(context: PhaseContext, output: PhaseOutput): void`.
2. In `packages/agent/src/loop/phases/config.ts`:
   - Remove `PhaseTransition` from exports (keep internal if needed by runtime hooks).

Guardrails:

- Do not wire up the new interface in the main loop yet.
- Phase implementations still use old output types temporarily.
- Keep `BeforePhaseResult`/`AfterPhaseResult` for runtime hooks.

### Prompt 3: PhaseContext Lifecycle Managers

Status: Complete

Goal: Add message and tool execution lifecycle managers to PhaseContext.

Expected next change:

1. In `packages/agent/src/loop/phases/config.ts`:
   - Add `PhaseMessageManager` type: `start(role, content, metadata): string`, `update(messageId, delta): Promise<void>`, `end(messageId): Promise<void>`.
   - Add `PhaseToolExecutionManager` type: `start(toolCallId, toolName, args): Promise<void>`, `update(toolCallId, partialResult): Promise<void>`, `end(toolCallId, toolName, result, isError): Promise<void>`.
   - Add `message: PhaseMessageManager` and `toolExecution: PhaseToolExecutionManager` to `PhaseContext`.
2. In `packages/agent/src/agent-loop.ts`:
   - Implement `message` manager in `createPhaseContext`: track active messages, emit `message_start`/`message_update`/`message_end`.
   - Implement `toolExecution` manager in `createPhaseContext`: emit `tool_execution_start`/`tool_execution_end`.
3. In `packages/agent/src/agent-loop.ts`:
   - `appendMessage`: remove `message_start`/`message_end` emission. Pure data append only.
   - `collectTextAndStructured`: accept `PhaseContext` parameter, use `context.message.start/update/end` instead of `context.appendMessage`.
   - `executeToolCall`: remove `observe` callback that emits tool events. Events are now emitted by the phase via `context.toolExecution`.

Guardrails:

- Do not change phase implementations yet.
- Message lifecycle events must be: `message_start` -> `message_update*` -> `message_end`.
- Tool execution events must be: `tool_execution_start` -> `tool_execution_end`.
- `appendMessage` must still append to transcript and state, just without events.

### Prompt 4: Convert Built-In Phase Outputs

Status: Complete

Goal: Convert all built-in phases to return unified `PhaseOutput` with `yield`.

Expected next change:

1. `packages/agent/src/loop/phases/built-in/chat/index.ts`:
   - `run` returns `{ message, route }` (no yield).
   - `finalize`: append routing message when route != "stop".
   - `createOutcome`: create direct answer outcome.
2. `packages/agent/src/loop/phases/built-in/plan/index.ts`:
   - `run` returns `{ message, route: "execute", yield: { task } }`.
   - `finalize`: `context.setTask(output.yield.task)`.
3. `packages/agent/src/loop/phases/built-in/execute/index.ts`:
   - `buildInput(context, yield)`: construct unified PhaseInput, filter tools by task toolNames.
   - `run` returns `{ message, route, yield: { toolResults } }`. Route from model output.
   - Use `context.toolExecution.start/end` for tool lifecycle events.
   - Use `context.message.start/end` for tool result messages.
   - `finalize`: set lastExecuteText, append toolResults to state.
4. `packages/agent/src/loop/phases/built-in/verify/index.ts`:
   - `buildInput(context, yield)`: construct unified PhaseInput. `input.yield` contains toolResults.
   - `run` returns `{ message, route }`. Route from model output ("stop" or "execute").
   - `createOutcome`: create task outcome from output.message.

Guardrails:

- All phase `run` functions return `PhaseOutput`.
- Phase-specific data (task, toolResults) flows through `yield`, not separate typed fields.
- Execute phase route is decided by the model, not by `toolCalls.length`.
- Verify phase does not have `passed: boolean` in its output.

### Prompt 5: Main Loop Unified Routing

Status: Complete

Goal: Make the main loop read `output.route` for all transitions. Remove `applyOutput` calls.

Expected next change:

1. In `packages/agent/src/agent-loop.ts` `runLoop`:
   - Remove `handler.applyOutput(context, phaseInput, output)` calls.
   - Read `output.route` directly.
   - If `route === "stop"`: call `handler.createOutcome?.(output, runtime) ?? createDefaultOutcome(output)`.
   - Otherwise: set `currentPhaseId = output.route`.
   - Pass `lastYield = output.yield` to next phase's `buildInput`.
   - Add generic `phaseVisits` limit using `handler.conversationLimit`.
2. Remove `PhaseTransition` usage from the main loop.
3. Update `BeforePhaseResult`/`AfterPhaseResult` to work with unified `PhaseOutput`.

Guardrails:

- Main loop must not contain phase-specific routing logic.
- `output.route` is the single source of truth.
- Runtime hooks (`beforePhase`/`afterPhase`) still work.
- Generic visit limit prevents infinite loops.

### Prompt 6: AgentState Cleanup

Status: Planned

Goal: Remove `task` and `goal` from `AgentState`. These flow through `yield`.

Expected next change:

1. In `packages/agent/src/types.ts`:
   - Remove `task?: string` and `goal?: string` from `AgentState`.
   - Remove `task` and `goal` from `CreateAgentStateInput`.
   - Remove from `createAgentState`.
2. In `packages/agent/src/agent-loop.ts`:
   - Remove `task`/`goal` from `emitTurn` metadata.
   - Remove `task`/`goal` from `createRunResult`.
   - Remove `runtime.currentTask` — task is now in phase yield.
3. In `packages/agent/src/loop/phases/built-in/chat/index.ts`:
   - Remove `workerTask`/`workerGoal` from buildInput. Get from yield if available.
4. Update thread creation to pass task/goal through yield or thread config, not AgentState.

Guardrails:

- Do not break thread creation. Task/goal for threads come from thread config, not AgentState.
- `AgentState` retains: `id`, `parentSessionId`, `systemPrompt`, `input`, `messages`, `skills`, `createdAt`, `updatedAt`, `title`.
- Session persistence (version field) is a separate concern, not touched here.

### Prompt 7: LlmContext Removal And buildPrompt Unification

Status: Planned

Goal: Replace `LlmContext` union type with unified `PhaseInput` in `buildPrompt`.

Expected next change:

1. In `packages/agent/src/protocol/context.ts`:
   - Remove `LlmContext` discriminated union type.
2. In `packages/agent/src/loop/phases/built-in/types.ts`:
   - `buildPrompt(input: PhaseInput): string` — takes unified input instead of `LlmContext`.
3. Update each phase's `buildPrompt`:
   - Extract phase-specific data from `input.yield` instead of typed `LlmContext` variants.
   - Chat: get availablePhases from context (not input).
   - Execute: get task from `input.yield` or context.
   - Verify: get toolResults from `input.yield`.
4. Update `PhaseContext.model.collect` to accept prompt string directly instead of `LlmContext` payload.

Guardrails:

- Prompt content must not change. Same prompts, different input shape.
- `buildPrompt` is the phase's responsibility to construct its model input.

### Prompt 8: Tests, Verification, And Cleanup

Status: Planned

Goal: Update all tests, verify behavior, clean up dead code.

Expected next change:

1. Update `packages/agent/test/agent-loop.test.ts` for new event names and output format.
2. Update `packages/agent/test/agent-multiturn.test.ts`.
3. Update `packages/agent/test/thread.test.ts`.
4. Update `packages/cli/test/cli-real-model.test.ts` for `turn_start`/`turn_end`.
5. Update `packages/logging/test/pino-logger.test.ts` for new event names.
6. Remove dead code: old `LoopPhaseOutputMap`, `PhaseTransition`, `LlmContext`.
7. Search for stale references to `chat_start`/`chat_end`, `applyOutput`, `passed`.
8. Run full test suite and build.

Guardrails:

- Do not mark complete without fresh verification output.
- If a test fails, diagnose before changing expected behavior.
- Preserve all existing user-visible behavior.

## Completion Checklist

- [ ] All phase outputs are `PhaseOutput = { message, route, yield? }`.
- [ ] All phase inputs are `PhaseInput = { systemPrompt, messages, tools, skills, yield? }`.
- [ ] `LoopPhaseOutputMap`, `PhaseOutputMap`, `PhaseInputMap`, `ExecuteOutput` removed.
- [ ] `PhaseHandler` has no `applyOutput`.
- [ ] `PhaseHandler` has optional `createOutcome`.
- [ ] Main loop reads `output.route` for transitions.
- [ ] No phase-specific routing logic in main loop.
- [ ] `yield` carries data between phases.
- [ ] `AgentState` has no `task` or `goal`.
- [ ] `PhaseContext` has `message.start/update/end`.
- [ ] `PhaseContext` has `toolExecution.start/update/end`.
- [ ] `appendMessage` does not emit events.
- [ ] `collectTextAndStructured` uses `PhaseContext.message`.
- [ ] Events use `turn_start`/`turn_end`.
- [ ] `LlmContext` union type removed.
- [ ] `bun test packages/agent/test/` passes.
- [ ] `bun run build` passes.
- [ ] `git diff --check` passes.
