# Rowan v0.3.5

> 版本：v0.3.5
> 日期：2026-05-03
> 状态：implemented
> 上游文档：`docs/PLAN/v0.3.4/PLAN.md`、`.agent/docs/2026-05-03-cahciua-dcp-reuse-plan.md`

## 文档

| 文档 | 用途 |
|---|---|
| `docs/PLAN/v0.3.5/PLAN.md` | v0.3.5 主计划，聚焦移除自研 trace package，并用 Pino 承接 AgentEvent 日志输出 |
| `docs/PLAN/v0.3.5/TASKS.md` | 可直接拆 issue 的任务表 |

## v0.3.5 定位

v0.3.5 是 v0.3.4 store package consolidation 后的运行日志瘦身版本。

核心变化：

1. `AgentEvent`、`ExecutionTurn`、`Session` 等 Rowan 领域建模继续留在各自模块中。
2. `packages/trace` 不再作为独立包存在。
3. 新增 `packages/logging`，用 Pino 将现有颗粒度的 `AgentEvent` 输出成 JSONL run log。
4. CLI 默认写入 `<workspace>/runs/<timestamp>-<session-id>.jsonl`，但语义从 trace 改为 run log。
5. CLI 的 `--trace` 被 `--log` 替代，避免继续暴露 trace 概念。
6. 不引入 replay / fork / trace inspect；后续需要回放时从 `AgentStore.steps` 和 run log 组合设计。

## 快速验收

```bash
bun test packages
bun run build
```

预期：

- `packages/trace` 被移除。
- `packages/logging` 存在并导出 Pino-backed AgentEvent logger。
- CLI 不再依赖 `@rowan-agent/trace`。
- CLI help/config 输出使用 log terminology。
- run log JSONL 中每行是 Pino log record，并包含原始 `AgentEvent` payload。
- package boundary test 使用 `logging`，不再使用 `trace`。
