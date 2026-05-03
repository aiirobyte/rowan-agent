# Rowan v0.4.0 Plan

> 版本：v0.4.0
> 日期：2026-05-03
> 状态：implemented
> 技术栈：TypeScript + Bun
> 基线：v0.3.5 Pino Runtime Logging
> 任务表：`docs/PLAN/v0.4.0/TASKS.md`

## 1. v0.4.0 目标

v0.4.0 是 DCP-first architecture hardening 的第一步，目标是把当前已经出现的边界压力收敛成明确包契约，并尽量保持行为不变。

当前要解决的压力点：

1. `agent` 从 `store` 导入 `ExecutionTurn` / `ExecutionTurnEntry`，导致运行内核反向依赖持久化包。
2. `context` 从 `agent` 导入类型并直接构建 OpenAI wire format，导致上下文渲染和 provider 适配耦合。
3. `store` 和 `agent` 各自独立定义 `LlmPhase`、`ModelRef`、`ModelCallUsage`、`ToolCall`、`ToolResult` 等共享领域类型。
4. `agent` 包当前同时承载 public facade、phase workflow、task planning、verification、thread execution、tool running、DriverTurn recording vocabulary，kernel surface 过大。

v0.4.0 的定位不是新增 Agent 能力，而是拆出两个稳定边界：

```text
packages/protocol
  -> zero-dependency shared contracts

packages/runtime
  -> agent execution runtime: runner, route / plan / execute / verify, tools, hooks, MCP
```

Terminology is locked for this plan:

```text
runtime = agent execution runtime package and system layer
runner = runtime internal executor for one Agent run
sandbox/environment = tool or code execution environment
workflow = outer orchestration layer around Agent runs
```

MCP implementation belongs inside `packages/runtime` as a tool-provider source. v0.4.0 only needs to preserve this package boundary and make the runtime shape ready for it; full MCP server/client behavior can land after the tool runner and policy pipeline are stable.

## 2. Scope

### 2.1 必做

- 新增 `packages/protocol`。
- 新增 `packages/runtime`。
- 将共享契约移入 `protocol`：
  - `LlmPhase`
  - `ModelRef`
  - `ModelCallUsage`
  - `ToolCall`
  - `ToolResult`
  - `ExecutionTurn`
  - `ExecutionTurnEntry`
  - `StepFilter`
- 将 route / plan / execute / verify 执行逻辑从 `agent` 移入 `runtime` phase modules。
- 将 routing scheduler、skills application、hook pipeline、MCP tool-provider ownership、core tool execution、turn recording 移入 `runtime`。
- 将 `agent` 收窄为 small public kernel/facade：Agent class、session lifecycle、state、event fanout、abort/waitForIdle、以及少量 ergonomic type re-export。
- 将 `context` 的类型依赖改为 `protocol + session`，不再从 `agent` 导入领域类型。
- 保持 `Agent.prompt()`、`Agent.startThread()`、CLI flags、session schema、run log 输出行为不变。
- 更新 package boundary tests。

### 2.2 不做

- 不实现 provider-neutral `ConversationEntry[]`。
- 不实现 full `IntermediateAgentContext -> RenderedAgentContext` projection pipeline。
- 不实现 SSE streaming parser。
- 不实现 token budget truncation。
- 不实现 PolicyEngine。
- 不实现 replay / fork / compaction。
- 不改 persisted session schema。
- 不改 Pino run log schema，除非 import path 变化需要测试更新。

## 3. Target Package Shape

```text
packages/protocol/src/
  context.ts
  index.ts
  model.ts
  phase.ts
  task.ts
  tool.ts
  turn.ts
  validators.ts

packages/runtime/src/
  index.ts
  dir.ts
  runner.ts
  loop.ts
  thread.ts
  recorder.ts
  phases/index.ts
  phases/types.ts
  phases/routing.ts
  phases/verifying.ts
  hooks/index.ts
  mcp/
  skills/
  tools.ts

packages/agent/src/
  index.ts
  agent.ts
  agent-loop.ts    # compatibility re-export
  scheduler.ts     # compatibility re-export
  task.ts          # compatibility re-export
  tools.ts         # compatibility re-export
  types.ts         # compatibility re-export
  verifier.ts      # compatibility re-export
```

The exact file split may follow the current codebase if a smaller move reduces churn, but the package responsibilities must match this target.

## 4. Target Dependency Direction

v0.4.0 target:

```text
protocol    -> none
session     -> none
store       -> protocol, session
context     -> protocol, session
runtime     -> protocol, session, store, context
agent       -> protocol, session, store, runtime
adapters    -> protocol, context
logging     -> agent
cli         -> adapters, agent, logging, protocol, runtime, session, store
```

Rules:

- `protocol` must be zero-dependency and side-effect free.
- `store` may persist protocol types, but must not define phase/model/tool/turn contracts.
- `context` is an input-rendering package and must not import `agent`.
- `runtime` owns execution mechanics, but must not import the public `Agent` facade.
- `runtime` also owns local workspace root/path helpers; there is no separate `workspace` package in the target.
- `runtime` exposes the one-run executor as `AgentRunner` / `runner.ts`; package name stays `runtime`.
- `runtime` owns MCP tool-provider implementation; MCP tools must flow through the same tool runner, hooks, events, and policy path as local tools.
- `agent` owns only the small public kernel/facade: lifecycle, state, event fanout, abort/waitForIdle, persistence orchestration, and optional ergonomic re-exports of public types such as `AgentMessage`, `ToolCall`, `ToolResult`, `StreamFn`, and `AgentEvent`.
- `agent` must not own route / plan / execute / verify, task planning, verification retry, routing scheduler, tool execution, DriverTurn recording, context rendering, or provider wire conversion.
- `adapters` convert provider wire formats and must not choose context visibility.

## 5. Migration Plan

### M0: Planning and Boundary Lock

目标：

- Create v0.4.0 execution docs.
- Record target dependency direction.
- Add package-boundary expectations before moving code.

验收：

- `docs/PLAN/v0.4.0/PLAN.md` and `TASKS.md` exist.
- `docs/PLAN/INDEX.md`, `ROADMAP.md`, and `ARCHITECTURE.md` link to v0.4.0.

### M1: Protocol Package

目标：

- Create `@rowan-agent/protocol`.
- Move shared model/tool/phase/turn types into protocol.
- Update package exports and import sites.

验收：

- `agent` no longer imports `ExecutionTurn` / `ExecutionTurnEntry` from `store`.
- `store` no longer defines `LlmPhase`, `ModelRef`, `ModelCallUsage`, `ToolCall`, or `ToolResult`.
- Existing type-level tests and package tests compile.

### M2: Context Import Cleanup

目标：

- Move `context` type imports from `agent` to `protocol` and `session`.
- Keep current prompt behavior and OpenAI-compatible message output unchanged until v0.5.0.

验收：

- `context` does not import `agent`.
- Existing prompt contamination tests still pass.
- No provider-neutral IR is introduced yet.

### M3: Runtime Package Scaffold

目标：

- Create `@rowan-agent/runtime`.
- Define runtime input/output ports around model streaming, tools, MCP tool providers, hooks, store, context, scheduler, and event emission.
- Keep public `Agent` API unchanged while delegating through the runtime boundary.

验收：

- Runtime can be imported without importing `agent`.
- Runtime exports the `AgentRunner` entrypoint naming while keeping the package name `runtime`.
- `Agent.prompt()` still returns the same `Outcome` shape.
- CLI command behavior stays unchanged.

### M4: Move Execution Mechanics

目标：

- Move route / plan / execute / verify into runtime phase modules.
- Move scheduler, skill application, hook pipeline, tool execution, MCP ownership boundary, and turn recording into runtime.
- Keep `agent` as the small public kernel/facade and remove runtime-only implementation from its ownership.
- Keep tests green after each mechanical move where practical.

验收：

- `agent` contains facade/lifecycle/state code, not phase execution code.
- Runtime owns core tool execution, MCP tool-provider ownership, hooks, and `ExecutionTurn` recording.
- `agent` may re-export public kernel contracts, but shared type definitions come from `protocol` / `session`.
- Direct, task, thread, budget, multi-turn, and verify retry tests pass.

### M5: Release Hardening

目标：

- Update package boundary tests.
- Update public exports.
- Update README / architecture references.
- Run release gates.

验收：

- `bun test packages`
- `bun run build`
- `bun run rowan "hello"`
- `bun run rowan --session <session-id> "continue"`
- No package boundary regression.

## 6. Compatibility Rules

- `Agent.prompt(input)` behavior must remain stable.
- `Agent.startThread(input)` behavior must remain stable.
- Session JSON schema must remain stable for v0.4.0.
- Pino run log output remains an observability sink and must not become replay state.
- Error messages may change only when import boundaries require clearer ownership wording.

## 7. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Runtime split becomes a behavior rewrite | Regression risk increases | Move code in thin slices and keep existing tests as behavior contract |
| Protocol package grows into a dumping ground | Weak boundaries | Only shared cross-package contracts enter protocol |
| `agent` regrows into a large runtime package through convenience exports | Boundary regression | Allow thin re-exports only; implementations and owned type definitions stay in `runtime`, `protocol`, or `session` |
| Context cleanup accidentally changes prompts | Route/plan behavior changes | Snapshot current prompt behavior before and after import cleanup |
| Core tools move before policy is ready | Safety semantics unclear | Preserve existing hooks and move policy redesign to v0.6.0 |
| MCP expands v0.4.0 beyond boundary hardening | Regression and dependency risk increases | Put MCP ownership under `runtime/mcp`, but defer full external server/client behavior until the tool runner and policy path are stable |
| Circular imports through runtime/agent | Build instability | Enforce boundary tests before release |

## 8. Release Checklist

- [x] `packages/protocol` exists and exports shared contracts.
- [x] `packages/runtime` exists and exports runtime execution entrypoints.
- [x] `agent` imports protocol types directly instead of through `store`.
- [x] `store` persists protocol types without redefining them.
- [x] `context` imports `protocol + session`, not `agent`.
- [x] `runtime` owns route / plan / execute / verify implementation.
- [x] `runtime` owns scheduler, skills application, hooks, MCP tool-provider ownership, core tool execution, and turn recording.
- [x] `agent` is a small public kernel/facade and does not own phase workflow, task planning, verification, tool execution, or DriverTurn recording.
- [x] Package boundary tests updated.
- [x] `bun test packages`
- [x] `bun run build`
- [x] CLI smoke tests pass.
