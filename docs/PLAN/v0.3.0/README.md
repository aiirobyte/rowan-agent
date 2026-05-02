# Rowan v0.3.0

> 版本：v0.3.0
> 日期：2026-05-01
> 状态：已实现并通过 release gates
> 上游文档：`docs/PLAN/ROADMAP.md`、`docs/PLAN/ARCHITECTURE.md`、`docs/PLAN/v0.2.0/PLAN.md`

## 文档

| 文档 | 用途 |
|---|---|
| `docs/PLAN/v0.3.0/PLAN.md` | v0.3.0 主计划，聚焦 route-first task gating 和 sub_session |
| `docs/PLAN/v0.3.0/TASKS.md` | 可直接拆 issue 的任务表 |

## v0.3.0 定位

v0.3.0 优化 Agent 机制，而不是扩大工具生态。

核心变化：

1. 输入先经过 `route` phase。
2. 模型先判断是否需要创建 task。
3. 不需要 task 时直接输出格式化答案。
4. 需要 task 时才继续 `task_created -> execute -> verify`。
5. `sub_session` 作为当前 Agent 可控的新 session 能力引入，复用同一套 Agent loop。

## 快速验收

```bash
bun test packages
bun run build
bun run rowan "hello"
bun run rowan "use bash to print the current date"
```

预期：

- 普通回答不产生 `task_created`。
- 工具请求先产生 route `model_requested`，再产生 `task_created`。
- sub_session API 可以记录 parent/sub_session trace 关系。
- sub_session budget 超限返回结构化 failed outcome。
