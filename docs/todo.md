# Rowan Todo

Last updated: 2026-05-25

Use this file as the cross-session checklist. In a new AI window, start with:

```text
Read AGENT.md and docs/todo.md, then continue with the active version's next unchecked prompt under docs/version/<semver>/.
```

## Active Version

Active version: `0.4.7` planned

- Previous implemented baseline: `0.4.5`
- Planning baseline: current v0.4.6 phase module shape
- Active version docs: `docs/version/0.4.7/`
- Planning source: user correction that phase definitions should be `input + context capabilities -> output`, while `runLoop` owns runtime execution
- Next version: `0.5.0` Context Projection And Provider IR planning after v0.4.7

## Current Target

Target: v0.4.7 Phase Definition Runtime Boundary. Planned.

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

## Next Prompt

Start v0.4.7 Prompt 1.

Expected next change:

- Lock the new phase/runtime boundary with failing tests.

## Version Roadmap

- [x] v0.0.0 Minimal Agent Kernel.
- [x] v0.1.0 Real Model Runtime.
- [x] v0.2.0 Monorepo And Workspace Foundation.
- [x] v0.3.0 Route-first Thread Predecessor.
- [x] v0.3.1 Persistent Session And Multi-turn CLI.
- [x] v0.3.2 Threaded Agent Sessions.
- [x] v0.3.3 Storage Port And Scoped Context.
- [x] v0.3.4 Store Package Consolidation.
- [x] v0.3.5 Pino Runtime Logging.
- [x] v0.4.0 Protocol Boundary And Runtime Split.
- [x] v0.4.1 Agent Boundary Correction.
- [x] v0.4.2 Agent Loop IO Atomization.
- [x] v0.4.3 Agent Loop Package Boundary Consolidation.
- [x] v0.4.4 Agent Run Persistence And Data Flow Refactor.
- [x] v0.4.5 Phase-Configured Agent Loop.
- [ ] v0.4.6 Loop Phase Refactoring.
- [ ] v0.4.7 Phase Definition Runtime Boundary.
- [ ] v0.5.0 Context Projection And Provider IR.
- [ ] v0.6.0 Tool Runtime Policy Ports.
- [ ] v0.7.0 Replay, Fork, And Compaction.
- [ ] v0.8.0 Eval Harness.
- [ ] v0.9.0 Workflow Orchestration.
- [ ] v1.0.0 Modular Harness Runtime.

## Guardrails

- Keep `agent.ts` as the execution kernel/facade and `loop.ts` as Agent-owned orchestration.
- Do not move Agent loop ownership into `runtime`.
- Do not keep phase-specific control flow in `runAgentLoop()`.
- Do not add a second phase runner beside the base `runPhase()` path.
- Do not keep a standalone nested-run/thread constructor outside `runPhase()`.
- Do not let phase definitions import or receive `AgentLoopRuntime`.
- Do not keep phase-specific runtime mutation in phase definitions.
- Do not keep `runConfiguredPhase()` as a compatibility alias.
- Do not keep `builtin-config.ts` as a pass-through built-in assembly module.
- Do not keep phase-specific Rendering in a shared `loop/phases/prompt-builder.ts`.
- Do not make `agent` import `adapters`.
- Do not start v0.5.0 context projection in v0.4.7.
- Do not keep compatibility for old `<session-id>.json` session files in v0.4.4.
- Do not make `Agent` own durable persistence in v0.4.4.
- Do not add public API compatibility shims unless the user explicitly asks.
- Keep docs architecture decisions grounded in `CONTEXT.md` and `docs/adr/`.

## Working Notes

- Version-specific planning now belongs in `docs/version/<semver>/`.
- Root `docs/spec.md`, `docs/prompt_plan.md`, and `docs/todo.md` are current-session entry points.
- `docs/PLAN/` remains the legacy planning tree and historical reference for v0.0.0-v0.4.3 drafts.
- v0.4.3 completed on 2026-05-13 with `bun test packages` and `bun run build` passing.
- v0.4.4 was inserted before v0.5.0 on 2026-05-14 for Pi-style run persistence and data-flow refactoring.
- v0.4.4 completed on 2026-05-14 with `bun test packages` and `bun run build` passing.
- v0.4.5 was inserted before v0.5.0 on 2026-05-21 for phase-configured loop refactoring.
- v0.4.5 completed before v0.4.6 planning.
- v0.4.6 was inserted before v0.5.0 on 2026-05-25 for loop phase refactoring.
- v0.4.7 was inserted before v0.5.0 on 2026-05-25 for the phase definition runtime boundary refactor.
- v0.4.7 planning was corrected to keep built-in phases extension-style under `built-in/`, remove phase runtime definitions, rename `runConfiguredPhase()` to `runPhase()`, and drop old compatibility.
- v0.4.7 planning now treats `builtin-config.ts` removal as necessary, keeps `config.ts` generic, and moves phase-specific Rendering into each built-in phase extension.
- Update this file and the active version todo after every meaningful coding session.
