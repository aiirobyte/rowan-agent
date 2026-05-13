# Rowan Todo

Last updated: 2026-05-13

Use this file as the cross-session checklist. In a new AI window, start with:

```text
Read AGENT.md and docs/todo.md, then continue with the active version's next unchecked prompt under docs/version/<semver>/.
```

## Active Version

Active version: `0.4.3` planning

- Previous implemented baseline: `0.4.2`
- Active version docs: `docs/version/0.4.3/`
- Legacy draft source: `docs/PLAN/v0.4.3/`

## Current Target

Target: v0.4.3 Agent Loop Package Boundary Consolidation.

Definition of done:

- [x] Create `docs/version/0.4.3/spec.md`.
- [x] Create `docs/version/0.4.3/prompt_plan.md`.
- [x] Create `docs/version/0.4.3/todo.md`.
- [x] Create root `docs/spec.md`, `docs/prompt_plan.md`, and `docs/todo.md` entry points.
- [x] Create `docs/version/README.md`.
- [ ] Move shared phase output contracts into `protocol`.
- [ ] Add a typed phase-output stream event or equivalent cross-package contract.
- [ ] Preserve `StreamFn` compatibility where needed during migration.
- [ ] Update OpenAI-compatible adapter output normalization and tests.
- [ ] Add a runtime-owned, event-neutral tool execution primitive.
- [ ] Move default tool argument validation and hook handling out of `agent/src/loop.ts`.
- [ ] Cache compiled tool parameter validators if the runtime primitive compiles schemas.
- [ ] Update `runAgentLoop()` to consume typed adapter output and runtime tool execution.
- [ ] Preserve Agent-owned lifecycle, events, turns, attempts, verification, thread depth, and outcomes.
- [ ] Keep `agent` free of `adapters` imports.
- [ ] Avoid new `packages/agent/src/runtime.ts` or `packages/agent/src/model-stream.ts`.
- [ ] Update package boundary tests.
- [ ] Add runtime tool execution tests.
- [ ] Preserve direct, task, thread, multi-turn, limits, invalid schema, invalid tool args, and verify retry tests.
- [ ] Run `bun test packages`.
- [ ] Run `bun run build`.
- [ ] Update root docs after every meaningful v0.4.3 coding session.
- [ ] Update root docs and `docs/version/README.md` after v0.4.3 completion.

## Next Prompt

Start v0.4.3 Prompt 1.

Expected next change:

- Move shared phase output contracts into `packages/protocol` so cross-package phase output types are importable without depending on `agent`.

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
- [ ] v0.4.3 Agent Loop Package Boundary Consolidation.
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
- Update this file and the active version todo after every meaningful coding session.
