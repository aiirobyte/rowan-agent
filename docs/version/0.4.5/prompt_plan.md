# Rowan v0.4.5 Prompt Plan

Last updated: 2026-05-21
Status: Planned

## Version Target

Turn the Agent loop into a configurable phase engine. Remove hard-coded route/plan/execute/verify branches from `runAgentLoop()` and make every phase run through the same base `runPhase()` path, with specialization living only in phase definitions plus a default phase config.

## Prompts

### Prompt 0: Version Planning

Status: Complete

Goal: Insert v0.4.5 before v0.5.0 and lock the phase-configured loop direction.

Expected next change:

1. Create `docs/version/0.4.5/spec.md`.
2. Create `docs/version/0.4.5/prompt_plan.md`.
3. Create `docs/version/0.4.5/todo.md`.
4. Update `docs/spec.md`, `docs/prompt_plan.md`, `docs/todo.md`, `docs/version/README.md`, and `docs/README.md`.
5. Keep v0.5.0 Context Projection And Provider IR planned after v0.4.5.

Guardrails:

- Do not start implementation in Prompt 0.
- Do not start v0.5.0 context projection or provider IR.
- Do not move Agent loop ownership into `packages/runtime`.

### Prompt 1: Phase Config Contracts

Status: Planned

Goal: Add the configurable phase module and default phase definition contracts.

Expected next change:

1. Add focused tests for validating a phase config with an entry phase and known phase ids.
2. Add `packages/agent/src/loop/phase-config.ts`.
3. Define `AgentPhaseDefinition`, `AgentPhaseConfig`, `AgentPhaseTransition`, and config validation helpers.
4. Add `createDefaultAgentPhaseConfig()` returning built-in phase ids in their current order.
5. Export internal types through the Agent loop internals only where tests need them.

Guardrails:

- Keep these contracts in `packages/agent`, not `packages/runtime`.
- Do not encode route/plan/execute/verify as loop-required type keys.
- Keep the first contract small enough to support the current behavior before adding future workflow features.

### Prompt 2: Base Phase Runner

Status: Planned

Goal: Keep `runPhase()` as the single rigid base phase execution path that does not know individual phase names.

Expected next change:

1. Add tests for a custom phase definition that builds input, runs, applies effects, and returns `next`.
2. Refactor `packages/agent/src/loop/phases.ts` so `runPhase()` is the base phase runner for configured phases.
3. Make `runPhase()` call definition hooks in this order:
   - `buildInput`;
   - runtime `beforePhase`;
   - model/default runner or definition `run`;
   - parser/output normalization;
   - runtime `afterPhase`;
   - definition `apply`;
   - transition return.
4. Add a short `createRun` capability to the `runPhase()` phase context for phases that need to construct one child Agent run.
5. Keep runtime hook retry caps and abort semantics.

Guardrails:

- Do not add another specialized phase runner beside `runPhase()`.
- Do not parse route/plan/execute/verify inside `runPhase()`.
- Do not publish phase-specific events inside `runPhase()` except generic model/request/message handling already shared by all phases.
- Do not keep a standalone nested-run constructor outside the phase path.
- Do not remove current behavior until default built-in phases cover it.

### Prompt 3: Built-in Phase Definitions

Status: Planned

Goal: Re-express current route, plan, execute, verify, and thread behavior as built-in phase definitions.

Expected next change:

1. Add/update tests that cover default config direct answer, task route, thread route, verification disabled, retry, and max attempts.
2. Add `packages/agent/src/loop/built-in-phases.ts`.
3. Move route scheduling and direct-outcome transition into the route phase definition.
4. Move task creation and `task_created` emission into the plan phase definition.
5. Move task start/end, tool execution, tool result messages, and unverified outcome transition into the execute phase definition.
6. Move verification start/end, verification parsing, pass/fail retry, and failed outcome transition into the verify phase definition.
7. Move thread route execution into a thread phase definition that uses `runPhase()`'s phase-local `createRun` capability.

Guardrails:

- Do not leave direct answer, thread route, verify disabled, or retry branches in `runAgentLoop()`.
- Keep runtime tool execution in `packages/runtime`; only phase-defined Agent effects stay in `packages/agent`.
- Keep durable persistence outside the Agent loop.

### Prompt 4: Generic Loop Rewrite

Status: Planned

Goal: Replace `runAgentLoop()` phase branches with a generic phase-machine loop.

Expected next change:

1. Update `AgentLoopInput` to accept optional phase config without widening public API more than needed.
2. Refactor `runAgentLoop()` to:
   - create runtime;
   - resolve phase config;
   - initialize current phase from `entryPhaseId`;
   - call `runPhase()` until `stop` or `abort`;
   - complete the run through existing lifecycle helpers.
3. Replace hard-coded `AgentRunStatus` values with current phase id/status metadata.
4. Remove now-redundant direct imports of route/plan/execute/verify helper functions from `loop.ts`.
5. Remove the standalone nested thread constructor; thread/child run construction should be phase-local through `runPhase()`'s `createRun` capability.

Guardrails:

- Do not make `runAgentLoop()` inspect `route`, `task`, `thread`, `passed`, or `toolCalls` to choose the next phase.
- Do not keep child/thread Agent run construction as a separate loop helper.
- Do not introduce a workflow graph package.
- Do not make custom phase config responsible for chat/run lifecycle events.

### Prompt 5: Tests, Docs, And Handoff

Status: Planned

Goal: Verify compatibility and update docs after the phase-configured loop lands.

Expected next change:

1. Update `packages/agent/README.md` to describe the phase-configured loop.
2. Update `packages/runtime/README.md` to clarify runtime still does not own Agent phases.
3. Update `docs/architecture/module-map.md` and `docs/architecture/deepening-opportunities.md`.
4. Run `bun test packages`.
5. Run `bun run build`.
6. Run `git diff --check`.
7. Mark v0.4.5 todo items complete with verification evidence.
8. Update root docs to hand off to v0.5.0 after completion.

Guardrails:

- Do not mark complete without fresh verification.
- Do not leave root docs describing `runAgentLoop()` as a hard-coded route/plan/execute/verify state machine.
- Do not start v0.5.0 implementation during the handoff.

## Completion Checklist

- [x] Versioned docs created for v0.4.5.
- [x] Root docs point to v0.4.5 as active.
- [ ] Phase config contracts exist.
- [ ] Base `runPhase()` runner supports configured phases.
- [ ] Built-in phase definitions preserve current behavior.
- [ ] `runAgentLoop()` uses the generic phase-machine path.
- [ ] Hard-coded route/plan/execute/verify branches are removed from the loop.
- [ ] Custom phase config is covered by tests.
- [ ] Default direct/task/thread/verify/retry behavior is covered by tests.
- [ ] READMEs and architecture docs updated.
- [ ] `bun test packages`.
- [ ] `bun run build`.
- [ ] `git diff --check`.
- [ ] Root docs updated for v0.4.5 completion and v0.5.0 handoff.
