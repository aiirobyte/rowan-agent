# Rowan v0.3.1

> 版本：v0.3.1
> 日期：2026-05-01
> 状态：completed
> 上游文档：`docs/PLAN/ROADMAP.md`、`docs/PLAN/ARCHITECTURE.md`、`docs/PLAN/v0.3.0/PLAN.md`

## 文档

| 文档 | 用途 |
|---|---|
| `docs/PLAN/v0.3.1/PLAN.md` | v0.3.1 主计划，聚焦持久化 Session 和多轮 CLI |
| `docs/PLAN/v0.3.1/TASKS.md` | 可直接拆 issue 的任务表 |

## v0.3.1 定位

v0.3.1 是 Rowan 从单轮 run 走向持续会话的版本。

核心变化：

1. Session 可以保存到本地 workspace。
2. Agent 可以在同一个 Session 内连续处理多轮 prompt。
3. CLI 可以通过 `--session <id>` 继续已有会话。
4. CLI 新增 `sessions` 管理命令。
5. CLI 新增最小 `chat` 交互模式。
6. 每次显式进入 Session 产生 timestamped trace；同一 chat 进程内多轮 append，文件名和内容都关联同一个 session id。

## 快速验收

```bash
bun test packages
bun run build
bun run rowan "hello"
bun run rowan --session <session-id> "继续"
bun run rowan sessions list
bun run rowan sessions show <session-id>
bun run rowan chat
```

预期：

- 多轮 prompt 复用同一个 Session。
- Session 文件写在 `<workspace>/sessions/<session-id>.json`。
- 第二轮模型上下文包含第一轮用户输入和最终 answer。
- `runs/*.jsonl` 仍然一轮一份，并能关联 session id。
