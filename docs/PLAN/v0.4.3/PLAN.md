# Rowan v0.4.3 Plan

> 版本：v0.4.3
> 日期：2026-05-04
> 状态：planned
> 技术栈：TypeScript + Bun
> 基线：v0.4.2 Agent Loop IO Atomization
> 任务表：`docs/PLAN/v0.4.3/TASKS.md`
> 架构评审：`CONTEXT.md`、`docs/adr/`、`docs/architecture/deepening-opportunities.md`

## 1. Goal

v0.4.3 reduces `packages/agent/src/loop.ts` complexity by consolidating responsibilities at existing package boundaries.

The main rule:

```text
agent 保留 Agent driver 语义和有序状态机
protocol / adapters / runtime / context 承接各自已经拥有的边界职责
```

This is not a feature release. It is a cleanup release that prepares v0.5.0 context projection and provider IR work.

Architecture candidates for this release should be read from `docs/architecture/deepening-opportunities.md`; this plan only tracks which candidate work is scheduled into v0.4.3.

## 2. Current Problem

`packages/agent/src/loop.ts` currently combines:

- session/run input normalization;
- event and chat lifecycle;
- phase orchestration;
- model stream draining and structured-output collection;
- tool lookup, schema validation, approval hooks, execution, review hooks;
- task attempt and verification loops;
- thread route execution;
- outcome and error finalization.

v0.4.2 improved the internal IO shape, but the file still carries glue that belongs to other packages. Splitting it into many new Agent-internal files would reduce one file's size without improving the architecture.

## 3. Target Ownership

### 3.1 `protocol`

`protocol` should own shared contracts that more than one package needs:

- phase input/output maps or equivalent phase output aliases;
- typed model stream events for phase outputs;
- tool call/result and task output contracts;
- any provider-independent execution-turn entry shapes.

`protocol` must not own Agent control flow.

### 3.2 `adapters`

`adapters` should own provider response normalization:

- provider JSON/text extraction;
- provider tool-call shape conversion;
- route / plan / execute / verify output normalization;
- `ModelStreamEvent` emission in a phase-aware, typed form.

The Agent loop may drain stream events and materialize AgentEvents/ExecutionTurns, but it should not repair provider JSON contracts.

`agent` must not import `adapters`; the boundary remains `cli -> adapters -> protocol/context`, and `cli -> agent`.

### 3.3 `runtime`

`runtime` should own event-neutral tool execution primitives:

- tool lookup;
- tool argument preparation and validation;
- schema validator caching;
- before/after tool hook invocation;
- local/MCP/plugin tool runner integration;
- sequential/parallel execution mode primitives if added.

`runtime` should return structured tool execution outcomes. `agent` translates those outcomes into `AgentEvent`s and session/turn effects.

`runtime` must not own task attempts, verification, route/thread branching, or final outcomes.

### 3.4 `context`

`context` continues to own prompt construction and phase-readable context rendering.

v0.4.3 should not implement full context projection, but any prompt-related cleanup must stay in `context`, not in `agent` or `adapters`.

### 3.5 `agent`

`agent` keeps:

- `Agent` facade and session lifecycle;
- event fanout and run cancellation;
- `runAgentLoop()` ordering;
- route / direct / task / thread branching;
- attempts and verification semantics;
- outcome creation;
- `ExecutionTurn` materialization.

`loop.ts` should read as orchestration. It may keep small local lifecycle helpers, but it should not grow package-local `runtime.ts` or `model-stream.ts` substitutes.

## 4. Target Flow

```text
Agent.prompt()
  -> runAgentLoop()
  -> route phase
       stream from adapter: prompt/model/text/typed route output
       agent records phase effects
  -> direct | thread | task
  -> plan phase
       adapter returns typed task output
  -> attempt loop
       execute phase returns text/tool calls
       runtime executes tool calls through event-neutral tool runner
       agent appends tool results and emits events
       verify phase returns typed verification output
  -> outcome
```

The key distinction:

```text
adapters normalize model/provider output
runtime executes tools
agent orders the run and publishes effects
```

## 5. Required Work

### 5.1 Protocol Contracts

- Move shared phase IO aliases from Agent-private types into `protocol` where they are needed across packages.
- Add a typed phase-output stream event or equivalent contract so `structured_output: unknown` is no longer the main cross-package output path.
- Keep compatibility for existing `StreamFn` tests during migration if a direct replacement would be too disruptive.

### 5.2 Adapter Stream Output

- Update OpenAI-compatible adapter tests to assert typed phase outputs.
- Keep provider-specific JSON extraction and schema errors in `adapters`.
- Ensure invalid provider output still surfaces useful error codes and details.

### 5.3 Runtime Tool Execution

- Add an event-neutral tool execution helper in `runtime`.
- Move tool argument validation and default before/after hook handling out of `agent`.
- Cache compiled tool parameter validators.
- Preserve current hook behavior and error semantics.

### 5.4 Agent Loop Consolidation

- Keep `runAgentLoop()` in `packages/agent/src/loop.ts`.
- Use `protocol` typed phase output contracts instead of Agent-local unknown parsing where possible.
- Use `runtime` tool execution primitives for default tool calls.
- Keep Agent-owned event emission, session message appends, turn recording, task attempts, verification, thread depth, and outcomes.
- Do not add many new Agent-internal files. Reuse existing `phases/`, `task.ts`, and `recorder.ts` when Agent-owned logic needs a home.

### 5.5 Tests and Docs

- Update package boundary tests if new imports are introduced.
- Preserve direct/task/thread/multi-turn/limits/verify retry tests.
- Add tests for runtime tool execution primitives and typed adapter phase output.
- Update README/architecture docs after implementation.

## 6. Not Doing

- No full context projection or provider-neutral `ConversationEntry[]`.
- No new policy engine.
- No full MCP server/client behavior.
- No replay/fork/compaction.
- No workflow graph.
- No public API stabilization.
- No package version bump until implementation is complete.

## 7. Acceptance Criteria

- `agent` does not import `adapters`.
- `runtime` does not own route / plan / execute / verify ordering.
- Agent loop no longer owns provider JSON repair/normalization.
- Default tool execution uses runtime-owned execution primitives.
- Tool approval/review hooks behave the same as v0.4.2.
- `runAgentLoop()` still visibly owns route / branch / plan / attempt execute / verify / outcome.
- No new `packages/agent/src/runtime.ts` or `packages/agent/src/model-stream.ts`.
- Package boundary tests pass.
- Direct, task, thread, multi-turn, limits, invalid schema, invalid tool args, and verify retry tests pass.
- `bun test packages` passes.
- `bun run build` passes.
