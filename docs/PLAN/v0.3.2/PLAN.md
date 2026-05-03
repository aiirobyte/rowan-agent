# Rowan v0.3.2 Plan

> 版本：v0.3.2
> 日期：2026-05-02
> 状态：implemented
> 基线：v0.3.1 Persistent Session + Multi-turn CLI
> 任务表：`docs/PLAN/v0.3.2/TASKS.md`

## 1. v0.3.2 目标

v0.3.2 的目标是把 Rowan 的 predecessor runner 能力收敛为“普通 Agent + 普通 Session 的同构执行”。

核心变化：

```text
main Session
  -> route
  -> direct response
     或 thread route
       -> create child Session(input, task?, goal?, parentSessionId)
       -> run normal Agent loop in child Session
       -> thread_end with child outcome
       -> main Session verify thread results
       -> final outcome
```

也就是说，主 Session 需要工具、大规模任务或可拆分任务时，不再把主流程写成 `tool -> verify`，而是写成 `thread -> verify`。子 Session 概念上就是 thread；它使用和主 Agent 完全相同的 loop，只是带上 `parentSessionId`、`task`、`goal` 以及 worker 路由规则。

## 2. Session Schema

`Session` 字段调整：

```ts
type Session<TLogEvent = never> = {
  version: "0.3.2";
  id: string;
  parentSessionId?: string;
  systemPrompt: string;
  input: string;
  task?: string;
  goal?: string;
  messages: AgentMessage[];
  log: TLogEvent[];
  skills: Skill[];
  createdAt: string;
  updatedAt: string;
  title?: string;
};
```

要求：

- Session 使用 `input` 作为唯一初始输入字段。
- `input` 只在 `session_created` / `createSession()` 时创建，后续多轮 `appendUserTurn()` 不再更新它。
- 当前轮 prompt 从最新 user message 或 loop runtime 中读取，不能依赖 Session 初始输入被改写。
- `task` 和 `goal` 是可选字段，用于表达 child thread 的结构化任务与完成目标。
- 持久化 JSON 使用同一 schema，只写出 `input`。

## 3. Thread Model

新增 thread 语义，作为 predecessor 能力的 v0.3.2 名称：

```ts
type ThreadInput = {
  parentSessionId: string;
  prompt: string;
  task?: string;
  goal?: string;
  tools: Tool[];
  skills?: Skill[];
  maxAttempts?: number;
  budget?: AgentRunBudget;
};
```

运行规则：

- 创建 child Session 时写入 `input = prompt`，并透传 `task` / `goal`。
- child Session 继续使用 `runAgentLoop()`，不引入专门的 thread runner loop。
- child thread 可以继续显式创建 nested thread，但默认 worker 路由应优先完成自己的 task / goal。
- 公开 API 只提供 `runThread()` / `Agent.startThread()`。
- 新事件使用 `thread_created` 和 `thread_end`；trace inspector 需要识别 thread parent/child 关系。

## 4. Routing Rules

`route` phase 从二元决策升级为三类决策：

```ts
type TaskRoutingDecision = {
  route: "direct" | "task" | "thread";
  message: string;
  thread?: {
    prompt: string;
    task: string;
    goal: string;
  };
};
```

路由要求：

- `direct`：普通聊天、解释、写作、计算等不需要工具的请求，直接返回用户可见答案。
- `thread`：主 Session 中需要工具、workspace access、命令执行、文件读写、可验证大任务或显式要求代理完成的请求。
- `task`：带有 `session.task` / `session.goal` 的 worker Session 中，用原有 `plan -> execute -> verify` 机制完成自己的任务。
- scheduler 保留现有显式工具请求兜底，但在主 Session 中应把这类请求提升为 `thread`。

## 5. Main Loop Semantics

主 Session 进入 thread route 后：

1. 记录 routing decision。
2. 发出 `thread_created`。
3. 创建并运行 child Session。
4. 收集一个或多个 child outcome。
5. 发出 `thread_end`。
6. 调用 verify phase，用 child thread results 作为 task output。
7. 返回主 Session 的 final outcome。

MVP 先支持单 thread；类型和执行器允许后续扩展到多个 thread 并行。

## 6. Prompt Updates

Prompt builder 需要显式告诉模型：

- Session 有 immutable `input`，当前轮 prompt 由最新 user turn 表示。
- route JSON 可以返回 `route: "direct" | "task" | "thread"`。
- 主 Session 需要工具时应选择 `thread`，而 worker Session 有 `task` / `goal` 时应选择 `task`。
- plan prompt 在 worker Session 中要优先围绕 `session.task` 和 `session.goal` 生成可执行 Task。
- verify prompt 可以接受 thread results，最终由主 Session 给出用户可见答案。

## 7. Breaking Changes

v0.3.2 不保留旧 predecessor 兼容层：

- 删除旧 predecessor API。
- 删除 legacy predecessor runner。
- route parser 只接受 `route: "direct" | "task" | "thread"`。
- trace inspector 只识别 `thread_created` / `thread_end` 作为 child thread 事件。

## 8. Acceptance Criteria

- `Session`、持久化 schema、trace snapshot 全部使用 `input`。
- 多轮 `Agent.prompt()` 不更新 `session.input`，但当前轮 route / plan 仍使用最新 user turn。
- `createSession()` 支持 optional `task` / `goal`。
- `Agent.startThread()` 创建 child Session 并运行同一套 Agent loop。
- 旧 predecessor API 和事件不再暴露。
- 主 Session 对工具/大任务请求可自动创建 thread，收集 child outcome 后进行 verify。
- trace 包含 `thread_created` 和 `thread_end`，并能被 inspector 识别 parent/child 关系。
- OpenAI-compatible prompt 与 parser 只支持新 route schema。
- `bun test packages` 和 `bun run build` 通过。

## 9. Not In v0.3.2

- 不做完整 workflow DAG。
- 不做 agent marketplace 或多角色协商。
- 不做跨 thread 共享 memory。
- 不做持久化 thread replay / fork。
- 不做 UI。
