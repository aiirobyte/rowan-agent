# Rowan v0.4.3 Prompt Plan

Last updated: 2026-05-13
Status: Complete

## Version Target

Implement Agent Loop Package Boundary Consolidation. `agent` should remain the execution kernel and loop owner, while shared phase contracts move to `protocol`, provider output normalization stays with `adapters`, and default tool execution moves to `runtime` as an event-neutral primitive.

## Prompts

### Prompt 0: Version Planning Migration

Status: Complete

Goal: Move the next Rowan version plan into the new docs format.

Expected next change:

1. Create `docs/version/0.4.3/spec.md`.
2. Create `docs/version/0.4.3/prompt_plan.md`.
3. Create `docs/version/0.4.3/todo.md`.
4. Create root `docs/spec.md`, `docs/prompt_plan.md`, and `docs/todo.md`.
5. Create `docs/version/README.md`.
6. Update docs navigation to point future version work at `docs/version/<semver>/`.

Guardrails:

- Do not delete the legacy `docs/PLAN/` history.
- Do not start implementation while migrating planning format.

### Prompt 1: Protocol Phase Output Contracts

Status: Complete

Goal: Move shared phase output contracts into `protocol` so cross-package phase output types are no longer Agent-private.

Expected next change:

1. Inspect current phase input/output types in `packages/agent/src`.
2. Identify only the phase output contracts needed outside `agent`.
3. Add or move those contracts into `packages/protocol/src`.
4. Update imports so consumers no longer need Agent-private types for shared phase outputs.
5. Preserve existing behavior and avoid public compatibility shims unless required by current tests.
6. Run focused type/build checks.

Guardrails:

- Do not move Agent control flow into `protocol`.
- Do not export broad Agent loop internals as protocol contracts.
- Keep this prompt about contracts, not adapter behavior.

### Prompt 2: Adapter Typed Phase Output

Status: Complete

Goal: Keep provider-specific JSON/text/tool-call normalization in `adapters` and expose typed phase output to the Agent loop.

Expected next change:

1. Add failing adapter tests for typed route, plan, execute, and verify phase output events or equivalent contracts.
2. Keep provider-specific schema and JSON extraction errors inside adapter-owned code.
3. Update OpenAI-compatible adapter code to emit or return the typed phase output contract.
4. Update Agent-side consumption only as needed for the new contract.
5. Verify invalid provider output still reports useful error codes/details.
6. Run adapter-focused tests and `bun run build`.

Guardrails:

- Do not make `agent` import `adapters`.
- Do not use `structured_output: unknown` as the primary cross-package contract once typed output is available.
- Do not begin v0.5.0 context projection.

### Prompt 3: Runtime Tool Execution Primitive

Status: Complete

Goal: Move default tool lookup, argument validation, execution, and before/after hook handling into runtime-owned event-neutral primitives.

Expected next change:

1. Add failing runtime tests for unknown tool, invalid args, blocked call, successful call, and after-hook result handling.
2. Add an event-neutral runtime helper that executes one prepared tool call and returns a structured outcome.
3. Move default tool argument validation into runtime.
4. Cache compiled tool parameter validators if schemas are compiled inside the helper.
5. Preserve current before/after hook behavior and error semantics.
6. Run focused runtime tests and `bun run build`.

Guardrails:

- Runtime must not emit `AgentEvent`s directly.
- Runtime must not own task attempts, verification, route/thread branching, or final outcomes.
- Keep Agent event/session/turn effects in `agent`.

### Prompt 4: Agent Loop Consolidation

Status: Complete

Goal: Update `runAgentLoop()` to consume typed provider output and runtime tool execution while preserving Agent-owned ordering and effects.

Expected next change:

1. Replace Agent-local provider output parsing where typed adapter output is available.
2. Use runtime-owned tool execution for default tool calls.
3. Keep event emission, session message appends, execution turn recording, task attempts, verification, thread depth, and outcomes in `agent`.
4. Reuse existing `phases/` and `task.ts` only when Agent-owned logic needs a home; do not add shallow helper files for single call sites.
5. Confirm no new `packages/agent/src/runtime.ts` or `packages/agent/src/model-stream.ts` exists.
6. Run focused Agent loop tests and `bun run build`.

Guardrails:

- Do not move route / plan / execute / verify ordering into `runtime`.
- Do not split the Agent package into speculative helper files.
- Preserve direct, task, thread, multi-turn, limits, and verify retry behavior.

### Prompt 5: Regression, Docs, And Version Handoff

Status: Complete

Goal: Close v0.4.3 with regression coverage, full verification, and docs updated for the next version.

Expected next change:

1. Update package boundary tests for any new imports.
2. Run `bun test packages`.
3. Run `bun run build`.
4. Update `docs/version/0.4.3/todo.md` with completed prompts and verification evidence.
5. Update `docs/spec.md`, `docs/prompt_plan.md`, `docs/todo.md`, and `docs/version/README.md`.
6. Prepare the v0.5.0 handoff only after v0.4.3 is complete.

Guardrails:

- Do not mark v0.4.3 complete without test/build evidence.
- Do not start v0.5.0 implementation during the handoff.
- Keep old `docs/PLAN/` docs as historical context unless the user requests migration.

## Completion Checklist

- [x] Versioned docs format created for v0.4.3.
- [x] Shared phase output contracts live in `protocol`.
- [x] Adapter typed phase output is covered by tests.
- [x] Runtime owns default event-neutral tool execution.
- [x] Agent loop consumes typed provider output and runtime tool execution.
- [x] Agent behavior tests preserved.
- [x] Package boundary tests updated.
- [x] `bun test packages`.
- [x] `bun run build`.
- [x] Root docs updated for v0.4.3 completion and v0.5.0 handoff.
