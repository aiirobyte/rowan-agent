# Rowan v0.4.0

> 版本：v0.4.0
> 日期：2026-05-03
> 状态：implemented
> 上游文档：`docs/PLAN/ROADMAP.md`、`docs/PLAN/ARCHITECTURE.md`、`docs/PLAN/v0.3.5/PLAN.md`

## 文档

| 文档 | 用途 |
|---|---|
| `docs/PLAN/v0.4.0/PLAN.md` | v0.4.0 主计划，聚焦 protocol boundary 和 runtime split |
| `docs/PLAN/v0.4.0/TASKS.md` | 可直接拆 issue 的任务表 |

## v0.4.0 定位

v0.4.0 是 DCP-style architecture hardening 的第一步：最小行为变化的包结构升级。

核心变化：

1. 新增 `packages/protocol`，承载 `LlmPhase`、`ModelRef`、`ModelCallUsage`、`ToolCall`、`ToolResult`、`ExecutionTurn`、`ExecutionTurnEntry`、`StepFilter` 等零依赖共享契约。
2. 新增 `packages/runtime`，从 `agent` 中提取 agent execution runtime：`AgentRunner`、route / plan / execute / verify phase modules、routing scheduler、skills application、hooks、MCP tool-provider ownership、core tool execution、turn recording。
3. `agent` 瘦身为 small public kernel/facade：Agent class、session lifecycle、state、event fanout、abort/waitForIdle，以及少量 ergonomic type re-export；不再拥有 phase workflow、task planning、verification、tool runner 或 DriverTurn recording。
4. `store` 和 `agent` 不再各自独立定义模型/工具领域类型，统一从 `protocol` 导入。
5. `context` 不再从 `agent` 导入共享领域类型，改依赖 `protocol + session`。
6. `Agent.prompt()` 和 CLI 行为完全不变。

术语：

```text
runtime = agent execution runtime package and system layer
runner = runtime 内部负责启动一次 agent run 的执行器
sandbox/environment = 工具或代码运行环境
workflow = 外层编排
```

MCP 实现归属 `packages/runtime/src/mcp/`，作为 runtime 的 tool-provider 来源。v0.4.0 锁定这个边界，完整 MCP server/client 行为可在 tool runner 和 policy pipeline 稳定后落地。

## 快速验收

```bash
bun test packages
bun run build
bun run rowan "hello"
bun run rowan --session <session-id> "continue"
```

预期：

- `packages/protocol` 存在并导出共享契约类型。
- `packages/runtime` 存在并承载 `AgentRunner`、phase modules、routing logic、hooks、MCP ownership boundary、tool execution。
- `agent` 保持 small public kernel/facade，不再导入 `store` 的领域类型（改从 `protocol`），也不再拥有 runtime-only implementation。
- `store` 不再自定义 `LlmPhase`、`ModelRef` 等类型（改从 `protocol`）。
- `context` 不再导入 `agent`。
- 所有现有测试继续通过，行为无变化。

明确不在 v0.4.0 做：

- SSE streaming parser。
- token limits truncation。
- provider-neutral `ConversationEntry[]`。
- PolicyEngine / replay / compaction。
- 完整 MCP server/client integration。
