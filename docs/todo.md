# Rowan Todo

Last updated: 2026-05-13

Use this file as the cross-session checklist. In a new AI window, start with:

```text
Read AGENT.md and docs/todo.md, then continue with the active version's next unchecked prompt under docs/version/<semver>/.
```

## Active Version

Active version: `0.4.3` complete

- Previous implemented baseline: `0.4.3`
- Active version docs: `docs/version/0.4.3/`
- Legacy draft source: `docs/PLAN/v0.4.3/`
- Next version: `0.5.0` Context Projection And Provider IR planning

## Current Target

Target: v0.4.3 Agent Loop Package Boundary Consolidation. Complete.

Definition of done:

- [x] Create `docs/version/0.4.3/spec.md`.
- [x] Create `docs/version/0.4.3/prompt_plan.md`.
- [x] Create `docs/version/0.4.3/todo.md`.
- [x] Create root `docs/spec.md`, `docs/prompt_plan.md`, and `docs/todo.md` entry points.
- [x] Create `docs/version/README.md`.
- [x] Move shared phase output contracts into `protocol`.
- [x] Add a typed phase-output stream event or equivalent cross-package contract.
- [x] Preserve `StreamFn` compatibility where needed during migration.
- [x] Update OpenAI-compatible adapter output normalization and tests.
- [x] Add a runtime-owned, event-neutral tool execution primitive.
- [x] Move default tool argument validation and hook handling out of `agent/src/loop.ts`.
- [x] Cache compiled tool parameter validators if the runtime primitive compiles schemas.
- [x] Update `runAgentLoop()` to consume typed adapter output and runtime tool execution.
- [x] Preserve Agent-owned lifecycle, events, turns, attempts, verification, thread depth, and outcomes.
- [x] Keep `agent` free of `adapters` imports.
- [x] Avoid new `packages/agent/src/runtime.ts` or `packages/agent/src/model-stream.ts`.
- [x] Update package boundary tests.
- [x] Add runtime tool execution tests.
- [x] Preserve direct, task, thread, multi-turn, limits, invalid schema, invalid tool args, and verify retry tests.
- [x] Run `bun test packages`.
- [x] Run `bun run build`.
- [x] Update root docs after every meaningful v0.4.3 coding session.
- [x] Update root docs and `docs/version/README.md` after v0.4.3 completion.

## Next Prompt

Prepare v0.5.0 planning.

Expected next change:

- Create `docs/version/0.5.0/spec.md`, `docs/version/0.5.0/prompt_plan.md`, and `docs/version/0.5.0/todo.md` from roadmap context before implementing context projection or provider IR.

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
- [ ] v0.5.0 Context Projection And Provider IR.
- [ ] v0.6.0 Tool Runtime Policy Ports.
- [ ] v0.7.0 Replay, Fork, And Compaction.
- [ ] v0.8.0 Eval Harness.
- [ ] v0.9.0 Workflow Orchestration.
- [ ] v1.0.0 Modular Harness Runtime.

## Guardrails

- Keep `agent.ts` as the execution kernel/facade and `loop.ts` as Agent-owned orchestration.
- Do not move route / plan / execute / verify ordering into `runtime`.
- Do not make `agent` import `adapters`.
- Do not start v0.5.0 context projection in v0.4.3.
- Do not add public API compatibility shims unless the user explicitly asks.
- Keep docs architecture decisions grounded in `CONTEXT.md` and `docs/adr/`.

## Working Notes

- Version-specific planning now belongs in `docs/version/<semver>/`.
- Root `docs/spec.md`, `docs/prompt_plan.md`, and `docs/todo.md` are current-session entry points.
- `docs/PLAN/` remains the legacy planning tree and historical reference for v0.0.0-v0.4.3 drafts.
- v0.4.3 completed on 2026-05-13 with `bun test packages` and `bun run build` passing.
- Update this file and the active version todo after every meaningful coding session.
