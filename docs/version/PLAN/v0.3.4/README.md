# Rowan v0.3.4

> 版本：v0.3.4
> 日期：2026-05-03
> 状态：implemented
> 上游文档：`docs/PLAN/v0.3.3/PLAN.md`、`.agent/docs/2026-05-03-cahciua-dcp-reuse-plan.md`

## 文档

| 文档 | 用途 |
|---|---|
| `docs/PLAN/v0.3.4/PLAN.md` | v0.3.4 主计划，聚焦 `store` 包整合和 package 边界清理 |
| `docs/PLAN/v0.3.4/TASKS.md` | 可直接拆 issue 的任务表 |

## v0.3.4 定位

v0.3.4 是 v0.3.3 storage replacement 后的包边界整理版本。

核心变化：

1. 新增 `@rowan-agent/store` package。
2. `AgentStore`、`ExecutionTurn`、`StepFilter`、`InMemoryAgentStore` 移入 `store`。
3. JSON-backed `LocalJsonAgentStore` 也放入 `store`，不另建 `store-json` 包。
4. `session` 保持纯 Session / AgentMessage / ContextScope 数据模型。
5. `cli` 只装配 `LocalJsonAgentStore`，不再拥有存储实现。
6. `agent` 依赖 `store` 的端口和 execution step 类型。
7. package boundary test 更新，防止 storage adapter 回流到 CLI。

## 快速验收

```bash
bun test packages
bun run build
```

预期：

- `packages/store` 存在并导出 store port 与 JSON-backed store。
- `packages/cli/src/session-store.ts` 已移除。
- CLI 继续能创建、加载、列出 v0.3.3 session JSON。
- `session` 不依赖 `store`。
- `store` 不依赖 `agent`，避免 store/agent 循环。
