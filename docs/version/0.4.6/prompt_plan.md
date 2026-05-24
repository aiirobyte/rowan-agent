# Rowan v0.4.6 Prompt Plan

Last updated: 2026-05-25
Status: Planned

## Version Target

Refactor the Agent loop phase system: rename "route" to "chat", co-locate phase prompts with phase definitions, simplify routing heuristics, thread as phase-internal capability, rename `LlmPhase` to `LoopPhase`.

## Prompts

### Prompt 0: Version Planning

Status: Complete

Goal: Create v0.4.6 version docs.

Expected next change:

1. Create `docs/version/0.4.6/spec.md`.
2. Create `docs/version/0.4.6/prompt_plan.md`.
3. Create `docs/version/0.4.6/todo.md`.
4. Update `docs/version/README.md`.

Guardrails:

- Do not start implementation in Prompt 0.

### Prompt 1: Protocol Types

Status: Planned

Goal: Rename `LlmPhase` to `LoopPhase`, update protocol types, delete `RoutingDecision` and `ThreadTaskOutput`.

Expected next change:

1. `protocol/phase.ts`: Rename `LlmPhase` to `LoopPhase`.
2. `protocol/context.ts`: Rename `LlmPhaseOutputMap` to `LoopPhaseOutputMap`. Update `LlmContext` variant `phase: "route"` to `phase: "chat"`. Remove `RoutingDecision` references. Phase output becomes `PhaseOutput`.
3. `protocol/task.ts`: Delete `RoutingDecision`. Delete `ThreadTaskOutput`. Update `TaskOutput` to only `ToolTaskOutput`.
4. Update all imports across the codebase that reference `LlmPhase` to `LoopPhase`.
5. Type check will fail at this point (expected, fixed in later prompts).

Guardrails:

- Do not change behavior, only rename and delete types.
- Do not update phase definitions or prompts yet.

### Prompt 2: Phase Module Structure

Status: Planned

Goal: Create `loop/phases/` directory with phase definitions, types, and co-located prompts.

Expected next change:

1. Create `loop/phases/types.ts` with `PhaseDefinition`, `PhaseContext`, `PhaseTransition`, `PhaseOutput`.
2. Create `loop/phases/chat/index.ts` with `chatPhaseDefinition`.
3. Create `loop/phases/chat/types.ts` with `ChatInput`.
4. Create `loop/phases/chat/prompt.ts` with `buildChatPrompt` (moved from `harness/context/prompt.ts::buildRoutePrompt`).
5. Create `loop/phases/plan/index.ts`, `plan/types.ts`, `plan/prompt.ts`.
6. Create `loop/phases/execute/index.ts`, `execute/types.ts`, `execute/prompt.ts`.
7. Create `loop/phases/verify/index.ts`, `verify/types.ts`, `verify/prompt.ts`.
8. Create `loop/phases/index.ts` with `createBuiltinPhaseConfig()`.

Guardrails:

- Each phase module is self-contained with definition, types, and prompt.
- Chat phase `buildInput` reads available phases from `runtime.phaseConfig`.
- Chat phase `apply` routes based on `PhaseOutput.route`.

### Prompt 3: Delete Old Phase Files

Status: Planned

Goal: Delete `built-in-phases.ts`, `routing.ts`, `thread.ts`. Update imports.

Expected next change:

1. Delete `loop/built-in-phases.ts` (replaced by `loop/phases/index.ts`).
2. Delete `loop/routing.ts` (routing logic absorbed into chat phase).
3. Delete `loop/thread.ts` (thread is phase-internal capability).
4. Update `loop/phases.ts` imports to use new phase modules.
5. Update `loop.ts` imports.
6. Update `loop/phase-config.ts` to use new phase definitions.

Guardrails:

- Do not delete files until their replacements are verified.
- Keep `loop/phases.ts` as the execution engine.

### Prompt 4: Update Phase Execution Engine

Status: Planned

Goal: Update `loop/phases.ts` and `loop/shared.ts` for new phase system.

Expected next change:

1. `loop/phases.ts`: Remove `routePhase` constant. Update `collectTextAndStructured` to use `LoopPhase`. Move `normalizeRoutingInput`/`parseRoutingDecision` to `loop/phases/chat/index.ts` as `parseChatOutput`. Rename `routeRequest` to generic phase runner.
2. `loop/shared.ts`: Remove `routePhase`, `planPhase`, `executePhase`, `verifyPhase` constants. Remove `createThreadTaskOutput`. Update `LimitExceededError` and utilities to use `LoopPhase`.
3. `loop/phase-config.ts`: `DEFAULT_PHASE_IDS` → `DEFAULT_PHASE_ID`. Add `name`, `description` to phase definition type. Entry phase becomes "chat".

Guardrails:

- Keep `runConfiguredPhase` as the generic phase runner.
- Keep `collectTextAndStructured` as the stream collector.

### Prompt 5: Update Main Loop and Types

Status: Planned

Goal: Update `loop.ts`, `loop/types.ts`, and `types.ts`.

Expected next change:

1. `loop.ts`: Delete `AgentRunStatus`, replace with `runtime.currentPhase: string`. Delete `lastRouteDecision`. Update `LlmPhase` → `LoopPhase` references.
2. `loop/types.ts`: Delete `AgentRunStatus`. Delete `RouteInput`. Update `PhaseInputMap`/`PhaseOutputMap`. Update to `LoopPhase`.
3. `types.ts`: `AGENT_STATE_SCHEMA_VERSION` → `"0.4.6"`. Delete `RoutingDecision` re-export. Delete `ThreadTaskOutput` re-export. `LlmPhase` → `LoopPhase`.

Guardrails:

- Keep `AgentLoopRuntime` structure mostly unchanged.
- Keep `createLoopThread` for thread capability.

### Prompt 6: Update Downstream and Harness

Status: Planned

Goal: Update harness, engine, logging, CLI.

Expected next change:

1. `harness/context/prompt.ts`: Delete all phase-specific prompt functions. Keep only `buildSystemPrompt`.
2. `harness/context/prompt-builder.ts`: Import prompts from phase modules. Update `"route"` → `"chat"` in dispatch. `LlmPhase` → `LoopPhase`.
3. `harness/types.ts`: Delete `RoutingDecision` re-export. `LlmPhase` → `LoopPhase`.
4. `packages/engine/`: Update `LlmPhase` → `LoopPhase`. Delete `RoutingDecision` references.
5. `packages/logging/`: Update `LlmPhase` → `LoopPhase`.
6. `packages/cli/`: Update any `LlmPhase` references.

Guardrails:

- Keep `buildOpenAICompatiblePrompt` as the generic prompt assembly function.
- Keep `buildSystemPrompt` in harness.

### Prompt 7: Update Tests

Status: Planned

Goal: Update all test files.

Expected next change:

1. Update `"route"` → `"chat"` in all test assertions.
2. `LlmPhase` → `LoopPhase` in all test files.
3. Delete thread phase tests (thread is now phase-internal).
4. Update event assertions for new phase names.
5. Add tests for chat phase routing to available phases.
6. Add tests for phase-internal thread capability.

Guardrails:

- All existing behavior should be preserved through new phase definitions.
- Thread tests should verify phase-internal thread creation.

### Prompt 8: Verification and Handoff

Status: Planned

Goal: Full verification and docs update.

Expected next change:

1. `npx tsc --noEmit` — type check passes.
2. `bun test packages/agent/test/` — all tests pass.
3. `bun test packages/logging/test/` — logging tests pass.
4. `bun test packages/cli/test/` — CLI tests pass.
5. Update `docs/version/README.md` for v0.4.6.
6. Mark todo items complete.

Guardrails:

- Do not mark complete without fresh verification.

## Completion Checklist

- [ ] `LoopPhase = "chat" | "plan" | "execute" | "verify"`
- [ ] `routing.ts` deleted
- [ ] `thread.ts` deleted
- [ ] `built-in-phases.ts` deleted
- [ ] `RoutingDecision` deleted
- [ ] `ThreadTaskOutput` deleted
- [ ] Phase prompts co-located with phase definitions
- [ ] Chat phase routes dynamically to available phases
- [ ] Thread is phase-internal capability
- [ ] Engine reads `entryPhaseId` from config
- [ ] `npx tsc --noEmit` passes
- [ ] `bun test packages/agent/test/` passes
- [ ] `bun test packages/logging/test/` passes
- [ ] `bun test packages/cli/test/` passes
