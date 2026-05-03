# Rowan v0.4.1 Plan

> 版本：v0.4.1
> 日期：2026-05-03
> 状态：implemented
> 技术栈：TypeScript + Bun
> 基线：v0.4.0 Protocol Boundary + Runtime Split
> 任务表：`docs/PLAN/v0.4.1/TASKS.md`

## 1. Goal

v0.4.1 corrects the Agent/runtime ownership boundary before v0.5.0 context projection work begins.

v0.4.0 moved execution mechanics into `packages/runtime` to shrink the public `agent` package. That fixed dependency pressure, but it overcorrected the boundary: the Agent loop, phases, and thread semantics are the definition of Agent behavior. `runtime` should be glue around that flow, especially for tools, skills, hooks, MCP, policy, and future plugins.

The corrected target is:

```text
packages/agent
  -> Agent facade + Agent core

packages/runtime
  -> runtime glue and integration layer used by the Agent core
```

No new `core` package or `core/` directory will be created. `packages/agent/src/agent.ts` remains the central Agent entrypoint, and core driver files move beside it in `packages/agent/src/`.

There is no external API compatibility requirement for this project yet. Runtime exports that no longer match the boundary should be removed instead of preserved through compatibility re-exports.

## 2. Scope

### 2.1 Required

- Move Agent driver ownership from `runtime` to `agent`:
  - `packages/runtime/src/loop.ts` -> `packages/agent/src/loop.ts`
  - `packages/runtime/src/thread.ts` -> `packages/agent/src/thread.ts`
  - `packages/runtime/src/phases/*` -> `packages/agent/src/phases/*`
- Move Agent driver vocabulary from `runtime` to `agent`:
  - task parsing/outcome helpers;
  - execution turn recording.
- Keep `packages/agent/src/agent.ts` as the Agent core/facade entrypoint.
- Move or duplicate no files into a `core/` folder.
- Remove obsolete `runtime` exports for loop, thread, phases, and runner APIs.
- Delete `AgentRunner` if it only wraps `runAgentLoop`; call the loop directly from `Agent.prompt()`.
- Keep runtime-owned integration modules in `runtime`:
  - workspace helpers;
  - local core tools;
  - skills loading;
  - hooks and future policy integration;
  - MCP tool-provider boundary.
- Ensure the Agent core exposes narrow runtime hook/port interfaces for runtime glue to participate in loop execution.
- Update package boundary tests to reflect the corrected direction.
- Preserve public `Agent.prompt()` and CLI behavior.

### 2.2 Ownership Decision

`turn-recorder.ts` moved into `agent` because it records Agent driver turns and would otherwise force the Agent loop to depend on runtime-owned driver semantics.

### 2.3 Not Doing

- No new `packages/agent-core`.
- No `packages/agent/src/core/`.
- No runtime compatibility re-exports for removed loop/thread/phase APIs.
- No context projection rewrite.
- No provider-neutral `ConversationEntry[]`.
- No PolicyEngine implementation.
- No full MCP server/client behavior.

## 3. Target Package Shape

```text
packages/agent/src/
  agent.ts
  index.ts
  loop.ts
  thread.ts
  task.ts
  tools.ts
  types.ts
  phases/index.ts
  phases/types.ts
  phases/routing.ts
  phases/verifying.ts
  turn-recorder.ts        # if driver-turn assembly stays core-owned

packages/runtime/src/
  dir.ts
  hooks/index.ts
  index.ts
  mcp/index.ts
  skills.ts
  tools.ts
  types.ts               # runtime-only integration types, if needed
  turn-recorder.ts        # only if refactored into a runtime adapter
```

`agent.ts` is the core entrypoint, not a thin wrapper around a separate `core` module.

## 4. Target Dependency Direction

```text
protocol    -> none
session     -> none
store       -> protocol, session
context     -> protocol, session
runtime     -> protocol, session
agent       -> protocol, session, store, runtime
adapters    -> protocol, context
logging     -> agent
cli         -> adapters, agent, logging, protocol, runtime, session, store
```

Rules:

- `runtime` must not import `agent`.
- `agent` may import `runtime` integration modules such as tools, skills, hooks, MCP types, and workspace helpers.
- `runtime` must not own route / plan / execute / verify, thread semantics, retry rules, or outcome creation.
- `agent` must not become a provider adapter or plugin host; runtime remains the integration layer for those concerns.
- `protocol` continues to own shared contracts.

## 5. Migration Plan

### M0: Boundary Lock

Goals:

- Update planning docs to name the corrected boundary.
- Mark v0.4.1 as required before v0.5.0.
- Clarify no `core/` folder and no compatibility re-export requirement.

Acceptance:

- v0.4.1 docs exist.
- `ROADMAP.md`, `INDEX.md`, and `ARCHITECTURE.md` point to v0.4.1 before v0.5.0.

### M1: Move Agent Driver Files

Goals:

- Move loop, thread, and phases into `packages/agent/src/`.
- Update imports from `@rowan-agent/runtime/...` to local `agent` paths where appropriate.
- Remove `runtime` exports that no longer match ownership.

Acceptance:

- `packages/runtime/src/loop.ts` is gone.
- `packages/runtime/src/thread.ts` is gone.
- `packages/runtime/src/phases/` is gone or no longer exports Agent phase ownership.
- `packages/agent/src/loop.ts`, `thread.ts`, and `phases/*` own driver behavior.

### M2: Simplify Agent Execution Entry

Goals:

- Remove `AgentRunner` if it is only a wrapper around `runAgentLoop`.
- Have `Agent.prompt()` invoke the Agent loop directly.
- Keep `Agent.startThread()` backed by the Agent-owned thread runner.

Acceptance:

- `packages/agent/src/agent.ts` is the main Agent core/facade entrypoint.
- No `core/` folder exists.
- The Agent class still owns session lifecycle, event fanout, abort/waitForIdle, and store orchestration.

### M3: Runtime Glue Cleanup

Goals:

- Keep runtime focused on integration modules.
- Ensure local tools, skills, hooks, MCP, and workspace helpers remain available to CLI/application composition.
- Remove runtime exports for loop/thread/phases/runner.

Acceptance:

- Runtime README describes runtime as glue/integration, not Agent execution kernel.
- Runtime index exports only runtime-owned modules.
- CLI and application composition still import runtime tools/skills as needed.

### M4: Boundary Tests and Docs

Goals:

- Update package boundary tests.
- Update READMEs and architecture notes.
- Run release gates.

Acceptance:

- `bun test packages`
- `bun run build`
- CLI smoke behavior unchanged.

## 6. Compatibility

No compatibility re-exports are required. The project has no stable external API yet, so the package surface should be corrected cleanly.

Compatibility that must remain:

- `Agent.prompt(input)` behavior;
- `Agent.startThread(input)` behavior;
- CLI behavior;
- persisted session schema;
- run log meaning and event content unless changed by ownership-only import paths.

## 7. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| `agent` regrows into a broad platform | Recreates v0.3.5 pressure | Keep provider adapters, tools, skills, MCP, hooks, and policy integration in `runtime` |
| Runtime becomes too thin to justify its package | Naming confusion | Define runtime as tool/plugin/environment glue, not loop owner |
| Agent loop imports runtime too deeply | Hidden coupling | Expose narrow ports and keep runtime modules integration-focused |
| Test imports depend on runtime loop paths | Churn | Update tests directly; no compatibility exports |
| v0.5.0 starts before boundary correction | Context work encodes wrong ownership | Make v0.4.1 a hard predecessor for v0.5.0 |

## 8. Release Checklist

- [x] v0.4.1 docs created and linked.
- [x] loop moved to `packages/agent/src/loop.ts`.
- [x] thread runner moved to `packages/agent/src/thread.ts`.
- [x] phases moved to `packages/agent/src/phases/*`.
- [x] no `packages/agent/src/core/` exists.
- [x] obsolete runtime exports removed without compatibility re-exports.
- [x] runtime README describes glue/integration ownership.
- [x] agent README describes Agent core/facade ownership.
- [x] package boundary tests updated.
- [x] `bun test packages`
- [x] `bun run build`
