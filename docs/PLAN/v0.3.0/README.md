# Rowan v0.3.0

> 版本：v0.3.0
> 日期：2026-05-01
> 状态：规划与首批机制修正中
> 上游文档：`docs/PLAN/ROADMAP.md`、`docs/PLAN/ARCHITECTURE.md`、`docs/PLAN/v0.2.0/PLAN.md`

## 文档

| 文档 | 用途 |
|---|---|
| `docs/PLAN/v0.3.0/PLAN.md` | v0.3.0 主计划，聚焦 route-first task gating 和 sub Agent |
| `docs/PLAN/v0.3.0/TASKS.md` | 可直接拆 issue 的任务表 |

## v0.3.0 定位

v0.3.0 优化 Agent 机制，而不是扩大工具生态。

核心变化：

1. 输入先经过 `route` phase。
2. 模型先判断是否需要创建 task。
3. 不需要 task 时直接输出格式化答案。
4. 需要 task 时才继续 `task_created -> execute -> verify`。
5. sub Agent 作为父 Agent 可控的 child run 引入。

## 快速验收

```bash
bun test
bun run build
bun run rowan "hello"
bun run rowan "use bash to print the current date"
```

预期：

- 普通回答不产生 `task_created`。
- 工具请求先产生 route `model_call`，再产生 `task_created`。
- sub Agent API 可以记录 parent/child trace 关系。
