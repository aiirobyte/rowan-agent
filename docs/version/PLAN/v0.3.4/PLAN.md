# Rowan v0.3.4 Plan

> 版本：v0.3.4
> 日期：2026-05-03
> 状态：implemented
> 基线：v0.3.3 Storage Port + Scoped Context
> 任务表：`docs/PLAN/v0.3.4/TASKS.md`

## 1. v0.3.4 目标

v0.3.3 已完成存储模型升级：`session.messages` 收敛为 conversation context，route / plan / execute / verify 内部输出进入 `steps`。v0.3.4 的目标不是继续扩大存储能力，而是把包架构整理成更接近 Cahciua DCP 的边界：

```text
session: data model
store: storage port + in-memory/json implementations
agent: driver loop
context: rendering policy
adapters: provider wire conversion
cli: composition root
```

核心决策：

- 不把 `session` 和 `store` 合并。
- 不新增 `packages/store-json`；JSON-backed store 放进 `packages/store`。
- `store` 不能依赖 `agent`。
- `cli` 不再拥有本地 JSON store 实现。

## 2. 为什么不合并 session 和 store

`session` 是领域数据模型：

- `Session`
- `AgentMessage`
- `Skill`
- `ContextScope`
- persisted session schema helper

`store` 是持久化端口和实现：

- `AgentStore`
- `ExecutionTurn`
- `StepFilter`
- `InMemoryAgentStore`
- `LocalJsonAgentStore`

二者分开能保留清晰依赖方向：

```text
session <- store <- agent/cli
```

如果把 JSON store 放进 `session`，任何只想使用 Session 类型的包都会隐含接触文件系统实现和 storage adapter 语义。后续如果引入 SQLite 或 remote store，`session` 也会被迫膨胀。

## 3. Package Target

v0.3.4 目标包结构：

```text
packages/session
  src/session.ts
  src/session-store.ts

packages/store
  src/index.ts
  src/types.ts
  src/memory.ts
  src/json.ts

packages/agent
  src/agent.ts
  src/agent-loop.ts
  src/types.ts

packages/context
packages/adapters
packages/trace
packages/workspace
packages/cli
```

`packages/session/src/session-store.ts` 可以短期保留 `SessionStore` 和 persisted session helpers，因为它们定义 session-only CRUD 和 schema conversion。`AgentStore` 和 step storage 必须移出 `agent`，进入 `store`。

## 4. Dependency Direction

目标依赖规则：

| Package | Allowed imports |
|---|---|
| `session` | none |
| `workspace` | none |
| `store` | `session` |
| `agent` | `session`, `store` |
| `context` | `agent`, `session` |
| `adapters` | `agent`, `context` |
| `trace` | `agent`, `workspace` |
| `cli` | `adapters`, `agent`, `session`, `store`, `trace`, `workspace` |

注意：`store` 不应依赖 `agent`。因此 `ExecutionTurn` 需要在 `store` 中定义自己的最小模型相关类型：

```ts
type LlmPhase = "route" | "plan" | "execute" | "verify";

type ModelRef = {
  provider: string;
  name: string;
};

type ModelCallUsage = {
  inputMessages: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

type ToolCall = {
  id: string;
  name: string;
  args: unknown;
};

type ToolResult = {
  toolCallId: string;
  toolName: string;
  ok: boolean;
  content: unknown;
  error?: string;
};
```

这些类型与 `agent` 当前类型保持结构兼容。后续如果做 `packages/protocol`，再把它们从 `store` / `agent` 抽到协议包。

## 5. Store Package Shape

建议导出：

```ts
export type ExecutionTurnEntry =
  | { kind: "prompt"; message: Pick<AgentMessage, "role" | "content"> }
  | { kind: "assistant_text"; text: string }
  | { kind: "structured_output"; content: unknown }
  | { kind: "tool_call"; toolCall: ToolCall }
  | { kind: "tool_result"; result: ToolResult };

export type ExecutionTurn = {
  id: string;
  sessionId: string;
  parentSessionId?: string;
  phase: LlmPhase;
  requestedAtMs: number;
  completedAtMs: number;
  model: ModelRef;
  usage?: ModelCallUsage;
  scope: ContextScope;
  entries: ExecutionTurnEntry[];
};

export type AgentStore<TSession extends Session<unknown> = Session<unknown>> =
  SessionStore<TSession> & {
    appendStep(sessionId: string, step: ExecutionTurn): Promise<void>;
    loadSteps(sessionId: string, filter?: StepFilter): Promise<ExecutionTurn[]>;
  };

export class InMemoryAgentStore<TSession extends Session<unknown>> implements AgentStore<TSession> {}
export class LocalJsonAgentStore<TSession extends Session<unknown>> implements AgentStore<TSession> {}
```

文件分配：

- `types.ts`: schemas, `ExecutionTurn`, `AgentStore`, `filterSteps`
- `memory.ts`: `InMemoryAgentStore`
- `json.ts`: `LocalJsonAgentStore`
- `index.ts`: public exports

## 6. Migration From Current Code

当前 v0.3.3 位置：

```text
packages/agent/src/store.ts
packages/cli/src/session-store.ts
```

v0.3.4 迁移：

```text
packages/agent/src/store.ts        -> packages/store/src/types.ts + memory.ts
packages/cli/src/session-store.ts  -> packages/store/src/json.ts
```

调用点：

- `agent/src/agent.ts` 改从 `@rowan-agent/store` import `AgentStore`。
- `agent/src/agent-loop.ts` 改从 `@rowan-agent/store` import `ExecutionTurnEntry`。
- `agent/src/types.ts` 改从 `@rowan-agent/store` import `ExecutionTurn`。
- `cli/src/cli.ts` 改从 `@rowan-agent/store` import `LocalJsonAgentStore`。
- 测试中的 `InMemoryAgentStore` / `LocalJsonAgentStore` 改从 `@rowan-agent/store` import。

## 7. Not In v0.3.4

- 不做 `packages/protocol`。
- 不重构 `context -> agent` 依赖。
- 不引入 DB。
- 不做 `RenderedAgentContext`。
- 不改 v0.3.3 persisted JSON schema。
- 不做 legacy migration。

## 8. Acceptance Criteria

- 新增 `packages/store`。
- `AgentStore` / `ExecutionTurn` / `StepFilter` 从 `agent` 移入 `store`。
- `InMemoryAgentStore` 从 `agent` 移入 `store`。
- `LocalJsonAgentStore` 从 `cli` 移入 `store`。
- `agent` 依赖 `store`，但 `store` 不依赖 `agent`。
- `cli` 不再有 storage implementation 文件。
- package boundary test 覆盖 `store`。
- `bun test packages` 通过。
- `bun run build` 通过。
