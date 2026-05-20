# Rowan Todo

Last updated: 2026-05-21

Use this file as the cross-session checklist. In a new AI window, start with:

```text
Read AGENT.md and docs/todo.md, then continue with the active version's next unchecked prompt under docs/version/<semver>/.
```

## Active Version

Active version: `0.4.5` planned

- Previous implemented baseline: `0.4.4`
- Active version docs: `docs/version/0.4.5/`
- Planning source: user correction on phase specialization ownership
- Next version: `0.5.0` Context Projection And Provider IR planning after v0.4.5

## Current Target

Target: v0.4.5 Phase-Configured Agent Loop. Planned.

Definition of done:

- [x] Create `docs/version/0.4.5/spec.md`.
- [x] Create `docs/version/0.4.5/prompt_plan.md`.
- [x] Create `docs/version/0.4.5/todo.md`.
- [x] Update root docs and version index for v0.4.5.
- [ ] Add phase config contracts in `packages/agent/src/loop/phase-config.ts`.
- [ ] Refactor `packages/agent/src/loop/phases.ts` so `runPhase()` is the base runner for configured phases.
- [ ] Add built-in phase definitions in `packages/agent/src/loop/built-in-phases.ts`.
- [ ] Move route scheduling and direct answer decisions into the route phase definition.
- [ ] Move task creation into the plan phase definition.
- [ ] Move tool execution effects into the execute phase definition.
- [ ] Move verification, retry, and pass/fail outcome rules into the verify phase definition.
- [ ] Move thread route execution behind phase definition behavior using `runPhase()`'s phase-local `createRun` capability.
- [ ] Refactor `runAgentLoop()` into a generic phase-machine loop.
- [ ] Support configured/custom phase definitions in tests.
- [ ] Preserve default direct, task, thread, multi-turn, limits, invalid schema, invalid tool args, and verify retry behavior.
- [ ] Update READMEs and architecture docs.
- [ ] Run `bun test packages`.
- [ ] Run `bun run build`.
- [ ] Run `git diff --check`.
- [ ] Update root docs after v0.4.5 completion.

## Next Prompt

Start v0.4.5 Prompt 1.

Expected next change:

- Add phase config contracts and focused tests before rewriting `runAgentLoop()`.

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
- [ ] v0.4.5 Phase-Configured Agent Loop.
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
- Do not make `agent` import `adapters`.
- Do not start v0.5.0 context projection in v0.4.5.
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
- Update this file and the active version todo after every meaningful coding session.
