# Rowan v0

> 版本：v0  
> 日期：2026-04-30  
> 状态：v0 已定稿  
> 上游文档：`docs/ROADMAP.md`、`docs/ARCHITECTURE.md`

## 文档

| 文档 | 用途 |
|---|---|
| `docs/v0/PLAN.md` | v0 唯一主计划，包含目标、架构、执行方案和验收标准 |
| `docs/v0/TASKS.md` | 可直接拆 issue 的任务表 |

## v0 目标

v0 是 Rowan 的最简 Agent 内核版本：

```text
Session -> Agent -> Task -> Tool calls -> Verification -> Outcome -> Trace
```

## 快速验收

v0 通过以下命令验收：

```bash
bun install
bun test
bun run build
bun run rowan --fake "hello"
bun run rowan --fake "use echo tool"
bun run rowan --fake --trace .rowan/runs/latest.jsonl "use echo tool"
```
