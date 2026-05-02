# Rowan v0.3.2

> 版本：v0.3.2
> 日期：2026-05-02
> 状态：completed
> 上游文档：`docs/PLAN/ROADMAP.md`、`docs/PLAN/ARCHITECTURE.md`、`docs/PLAN/v0.3.1/PLAN.md`

## 文档

| 文档 | 用途 |
|---|---|
| `docs/PLAN/v0.3.2/PLAN.md` | v0.3.2 主计划，聚焦 thread/sub-session 同构化 |
| `docs/PLAN/v0.3.2/TASKS.md` | 可直接拆 issue 的任务表 |

## v0.3.2 定位

v0.3.2 把旧 sub-session/sub-agent 能力收敛为普通 Agent + 普通 Session 的 thread 执行。

核心变化：

1. `Session.userInput` 改为 immutable `Session.input`。
2. `Session` 增加 optional `task` 和 `goal`。
3. 主 Session 需要工具或大任务时创建 child thread。
4. child thread 使用同一套 `route -> plan -> execute -> verify` Agent loop。
5. trace 新增 `thread_created` 和 `thread_end`。
6. 旧 `runSubSession()` / `startSubSession()` 作为兼容入口委托到 thread 实现。

## 快速验收

```bash
bun test packages
bun run build
bun run rowan "hello"
bun run rowan "use bash to print the current date"
```

预期：

- Session snapshots 和 persisted JSON 使用 `input`，不再使用 `userInput`。
- 多轮续聊不会改写原始 `session.input`。
- 工具/大任务请求会先产生 `thread_created`，child thread 完成后产生 `thread_end`。
- 主 Session 基于 child thread outcome 完成 verify 并输出最终 outcome。
