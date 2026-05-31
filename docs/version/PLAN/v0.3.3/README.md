# Rowan v0.3.3

> 版本：v0.3.3
> 日期：2026-05-03
> 状态：implemented
> 上游文档：`docs/PLAN/v0.3.2/PLAN.md`、`.agent/docs/2026-05-03-cahciua-dcp-reuse-plan.md`

## 文档

| 文档 | 用途 |
|---|---|
| `docs/PLAN/v0.3.3/PLAN.md` | v0.3.3 主计划，聚焦 storage port、JSON-backed store、存储边界升级 |
| `docs/PLAN/v0.3.3/TASKS.md` | 可直接拆 issue 的任务表 |

## v0.3.3 定位

v0.3.3 是 Rowan 从“session messages 承载一切”走向“对话上下文 + 执行历史分离”的过渡版本。

核心变化：

1. 新增 `AgentStore` port，覆盖 session CRUD 和 step append/load。
2. 新增 JSON-backed store，当前仍用本地 JSON 文件承载。
3. Session schema 升级到 v0.3.3，并增加 `steps`。
4. `session.messages` 收敛为用户可见的 user/assistant 对话。
5. route / plan / execute / verify 内部输出进入 `ExecutionTurn`。
6. prompt builder 使用 phase-specific scope allowlist。
7. 旧 session schema 不自动迁移；v0.3.3 直接使用新 schema。

## 快速验收

```bash
bun test packages
bun run build
bun run rowan "hello"
bun run rowan --session <session-id> "continue"
```

预期：

- 新 session JSON 版本为 v0.3.3。
- `messages` 只保留 `conversation` scope 的用户/助手对话。
- `steps` 保留 route/plan/execute/verify 内部运行历史。
- 多轮 route 不会看到 routing decision、phase prompt、failed outcome 或无关 tool result。
- CLI `list` 仍能列出 session metadata，不暴露 step 内容。
