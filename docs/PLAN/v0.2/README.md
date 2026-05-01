# Rowan v0.2

> 版本：v0.2
> 日期：2026-05-01
> 状态：已实现
> 上游文档：`docs/PLAN/ROADMAP.md`、`docs/PLAN/ARCHITECTURE.md`、`docs/PLAN/v0.1/PLAN.md`

## 文档

| 文档 | 用途 |
|---|---|
| `docs/PLAN/v0.2/PLAN.md` | v0.2 主计划，聚焦 monorepo 拆包条件和 Workspace ACI 起步 |
| `docs/PLAN/v0.2/TASKS.md` | 可直接拆 issue 的任务表 |

## v0.2 定位

v0.2 是 Rowan 从单包 `src/` 走向模块化 runtime 的第一步。

它不是完整 v1.0 monorepo，也不是一次性完成所有包能力。v0.2 的目标是完成拆包条件，并开始把已经有清晰边界的模块迁出：

```text
src/ single package
  -> packages/agent
  -> packages/adapters
  -> packages/trace
  -> packages/aci
  -> packages/cli
```

`packages/eval` 和 `packages/workflow` 在 v0.2 只保留接口方向和边界约束，不做完整实现。

## v0.2 目标

1. 稳定 v0 public API 和事件 schema。
2. 把 OpenAI-compatible adapter 作为第一个真实 adapter 迁入 package 边界。
3. 让 trace 从 writer 扩展为 writer + reader + basic inspect。
4. 引入 Workspace ACI 的最小多工具集合。
5. 建立 Bun workspace / monorepo 基础结构。
6. 保持现有 CLI 使用方式不破坏：

```bash
bun run rowan "hello"
```

## 快速验收

v0.2 完成后，下面命令必须继续通过：

```bash
bun test
bun run build
bun run rowan "hello"
```

新增验收：

```bash
bun run rowan trace list
bun run rowan trace show <run-id-or-file>
bun run rowan "list project files"
```

## 拆包原则

v0.2 拆包以依赖方向为准：

```text
cli
  -> agent
  -> adapters
  -> trace
  -> aci

adapters -> agent
trace    -> agent
aci      -> agent

agent     -> no Rowan package dependency
```

任何 package 不能反向依赖 `cli`。`agent` 不能依赖 adapter、trace、aci、workflow 或 eval。
