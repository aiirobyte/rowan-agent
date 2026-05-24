# Rowan v0.4.6 Todo

Last updated: 2026-05-25
Status: Planned

## Version Target

Target: v0.4.6 Loop Phase Refactoring.

Definition of done:

- [x] Create `docs/version/0.4.6/spec.md`.
- [x] Create `docs/version/0.4.6/prompt_plan.md`.
- [x] Create `docs/version/0.4.6/todo.md`.
- [x] Update `docs/version/README.md`.
- [ ] Rename `LlmPhase` to `LoopPhase` across the codebase.
- [ ] Update protocol types: delete `RoutingDecision`, delete `ThreadTaskOutput`.
- [ ] Create phase module structure under `loop/phases/`.
- [ ] Move phase prompts to co-located phase modules.
- [ ] Implement `chatPhaseDefinition` with dynamic phase routing.
- [ ] Implement `planPhaseDefinition`, `executePhaseDefinition`, `verifyPhaseDefinition`.
- [ ] Delete `loop/built-in-phases.ts`.
- [ ] Delete `loop/routing.ts`.
- [ ] Delete `loop/thread.ts`.
- [ ] Update phase execution engine for new phase system.
- [ ] Update main loop: delete `AgentRunStatus`, use `currentPhase`.
- [ ] Update harness: keep only `buildSystemPrompt` in `prompt.ts`.
- [ ] Update downstream: engine, logging, CLI.
- [ ] Update all tests.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `bun test packages/agent/test/`.
- [ ] Run `bun test packages/logging/test/`.
- [ ] Run `bun test packages/cli/test/`.

## Verification Evidence

(To be filled after implementation)

## Next Prompt

v0.4.6 implementation starts with Prompt 1: Protocol Types.

## Guardrails

- Do not keep `RoutingDecision` or `ThreadTaskOutput` types.
- Do not keep `routing.ts` or `thread.ts` files.
- Do not hard-code phase names in the engine.
- Do not make thread a phase or a tool.
- Do not pre-set `plan → execute → verify` flow.
- Do not start v0.5.0 context projection or provider IR.

## Planning Notes

- 2026-05-25: User requested v0.4.6 to refactor phase system based on recursive thread creation bug analysis.
- 2026-05-25: User clarified: no pre-set flow, thread is not phase/tool, phase has properties, start with chat only.
- 2026-05-25: User clarified: no compatibility needed, thread is phase-internal capability.
- 2026-05-25: User clarified: `LlmPhase` → `LoopPhase`, `AgentRunStatus` → `currentPhase`, `DEFAULT_PHASE_ID` singular.
- 2026-05-25: User clarified: `PhaseOutput` is generic for all phases, engine uses `initPhase` from config.
- Update this file after every meaningful coding session.
