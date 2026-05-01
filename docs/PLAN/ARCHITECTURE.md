# Rowan Agent Technical Architecture

> 版本：v0.3.0
> 日期：2026-05-01
> 状态：v0.0.0 架构已定稿；v0.1.0 OpenAI-compatible StreamFn 已实现；v0.2.0 monorepo foundation 已实现；v0.3.0 route-first 机制启动
> 输入文档：`docs/PLAN/ROADMAP.md`、`docs/PLAN/v0.0.0/PLAN.md`、`docs/PLAN/v0.1.0/PLAN.md`、`docs/PLAN/v0.2.0/PLAN.md`、`docs/PLAN/v0.3.0/PLAN.md`

## 1. 架构目标

Rowan v0.0.0 的目标是实现一个最简 Agent 内核：

```text
Session
  -> Agent
  -> Task
  -> Tool calls
  -> Acceptance criteria verification
  -> Outcome
  -> Session log / JSONL trace
```

这个内核要满足：

- Agent 可以同时承担 planner 和 executor。
- Task 有结构化 acceptance criteria。
- Tool 调用有 schema validation。
- Verification 先由同一个模型完成。
- Session log 和 model messages 分离。
- Skill 以 `SKILL.md` 形式作为可执行能力加载。
- JSONL trace 通过事件订阅写入。

## 2. v0.0.0 总体架构

```mermaid
flowchart TB
  CLI["CLI"] --> Agent["Stateful Agent"]
  Agent --> Session["Session"]
  Agent --> Loop["runAgentLoop()"]

  Session --> Messages["Model Messages"]
  Session --> Log["Session Log"]
  Session --> Skills["SKILL.md Skills"]

  Loop --> Planner["Plan Task"]
  Planner --> Task["Structured Task"]
  Task --> Executor["Execute Task"]
  Executor --> Tools["Tool[]"]
  Tools --> ToolHooks["beforeToolCall / afterToolCall"]
  Executor --> Verifier["Same-model Verifier"]
  Verifier --> Criteria["Acceptance Criteria"]
  Verifier --> Outcome["Outcome"]

  Agent --> Events["Agent Events"]
  Events --> Log
  Events --> Trace["JSONL Trace Subscriber"]
```

## 3. v0.0.0 文件结构

v0.0.0 使用单包结构，不拆 `packages/*`。

```text
.
  package.json
  bun.lock
  tsconfig.json
  README.md

  src/
    index.ts
    types.ts
    agent.ts
    agent-loop.ts
    session.ts
    task.ts
    stream.ts
    tools.ts
    verifier.ts
    skills.ts
    trace-jsonl.ts
    cli.ts

  test/
    agent-loop.test.ts
    agent.test.ts
    task.test.ts
    verifier.test.ts
    trace-jsonl.test.ts

  skills/
    example/
      SKILL.md
```

## 4. 核心对象关系

```text
Agent
  owns AgentState
  owns Session
  runs agentLoop
  emits AgentEvent

Session
  owns model messages
  owns session log
  owns loaded skills

Task
  owns instruction
  owns acceptance criteria
  owns allowed tool names
  owns skill ids

Tool
  validates args
  executes action
  returns ToolResult

Verifier
  checks criteria
  returns VerificationResult

Outcome
  user-facing result
  includes evidence
```

## 5. Core Types

### 5.1 Session

```ts
interface Session {
  id: string;
  systemPrompt: string;
  userInput: string;
  messages: AgentMessage[];
  log: AgentEvent[];
  skills: Skill[];
  createdAt: string;
  updatedAt: string;
}
```

`messages` 和 `log` 必须分离：

- `messages`：发给模型的上下文。
- `log`：完整运行事件，可写入 trace。

### 5.2 Agent

```ts
interface AgentState {
  session: Session;
  model: ModelRef;
  tools: Tool[];
  isRunning: boolean;
  currentTask?: Task;
  currentOutcome?: Outcome;
  error?: string;
}

class Agent {
  prompt(input: string): Promise<Outcome>;
  abort(reason?: string): void;
  waitForIdle(): Promise<void>;
  subscribe(listener: AgentEventListener): Unsubscribe;
}
```

### 5.3 Task and Criteria

```ts
interface Task {
  id: string;
  title: string;
  instruction: string;
  acceptanceCriteria: AcceptanceCriterion[];
  toolNames: string[];
  skillIds: string[];
  status: "pending" | "running" | "passed" | "failed";
  attempts: number;
}

type AcceptanceCriterion =
  | {
      id: string;
      type: "model_judge";
      description: string;
      required: boolean;
    }
  | {
      id: string;
      type: "tool_observation";
      description: string;
      toolName?: string;
      required: boolean;
    };
```

### 5.4 Tool

```ts
interface Tool<TArgs = unknown> {
  name: string;
  description: string;
  parameters: TSchema;
  execute(
    args: TArgs,
    context: ToolContext,
    signal?: AbortSignal
  ): Promise<ToolResult>;
}
```

v0.0.0 不做 `ToolRegistry`。Agent state 直接持有 `Tool[]`。

### 5.5 Skill

```ts
interface Skill {
  id: string;
  path: string;
  content: string;
  toolNames?: string[];
}
```

v0.0.0 的 `Skill` 是 `SKILL.md` 可执行能力说明，注入模型上下文。真正的 skill 脚本沙箱、依赖管理、自动发现后置。

## 6. Agent Loop

v0.3.0 起 loop 先判断是否需要进入 task。只有 `needsTask: true` 才运行原来的三段 task 流程：

```text
route request
  -> if needsTask=false: direct response outcome
  -> if needsTask=true:
     plan task
       -> execute task with tools
       -> verify acceptance criteria
```

```ts
async function runAgentLoop(input: AgentLoopInput): Promise<Outcome> {
  const decision = await routeRequest(input);
  if (!decision.needsTask) {
    return createDirectOutcome(decision.message);
  }

  const task = await planTask(input);
  emit("task_created", { task });

  for (let attempt = 1; attempt <= input.maxAttempts; attempt++) {
    const execution = await executeTaskWithTools(task, input);
    const verification = await verifyTask(task, execution, input);

    if (verification.passed) {
      return createOutcome(task, verification);
    }
  }

  return createFailedOutcome(task);
}
```

## 7. StreamFn

v0.0.0 使用轻量 `StreamFn`，不做 provider registry。

```ts
type StreamFn = (
  model: ModelRef,
  context: LlmContext,
  options: StreamOptions
) => AsyncIterable<ModelStreamEvent>;
```

v0.0.0 必须实现 `FakeStreamFn`。真实模型 adapter 后置到 v0.1.0。

## 8. Tool Hooks

v0.0.0 权限与拦截先用 hooks。

```ts
type BeforeToolCall = (input: {
  task: Task;
  tool: Tool;
  args: unknown;
}) => Promise<{ allow: true } | { allow: false; reason: string }>;

type AfterToolCall = (input: {
  task: Task;
  tool: Tool;
  result: ToolResult;
}) => Promise<ToolResult>;
```

完整 `PolicyEngine` 后置到 v0.4.0。

## 9. Verifier

v0.0.0 verifier 由同一个模型完成。

```ts
interface VerificationResult {
  passed: boolean;
  message: string;
  evidence: Evidence[];
  failedCriteria: string[];
}
```

后续 v0.5.0 再加入 scorer。

## 10. Events and Trace

v0.0.0 事件生命周期：

```text
session_start
message_start
message_delta
message_end
model_call
task_created
task_attempt_start
tool_call_start
tool_call_end
verification_start
verification_end
outcome
session_end
error
```

`message_start.content` 记录初始 `session.messages` 数组，`message_delta.delta` 记录新增 `AgentMessage`，`message_delta.content` 记录追加后的完整数组，`message_end.content` 记录最终完整数组。`session_created` 不包含 messages、createdAt、updatedAt 或 messageCount。`model_call` 只记录消息数量和 provider token usage，不记录完整 prompt 或 raw response。

v0.3.0 的 direct response trace 必须包含 `model_call` route 和 `outcome`，但不能包含 `task_created`。需要工具或多步骤执行时，`model_call` route 必须出现在 `task_created` 之前。

Trace 是 subscriber：

```ts
agent.subscribe(jsonlTraceWriter(".rowan/runs/latest.jsonl"));
```

v0.0.0 不做 trace reader、replay、fork。

## 11. CLI

```bash
bun run rowan "hello"
bun run rowan --trace .rowan/runs/latest.jsonl "use echo tool"
bun run rowan --base-url https://api.openai.com/v1 --model gpt-4.1-mini "hello"
```

CLI 只负责：

- 创建 Agent。
- 注入真实模型 `StreamFn`。
- 注入 tools。
- 可选加载 skill。
- 默认挂 JSONL trace subscriber。
- 输出 outcome。

## 12. Future Modular Architecture

v0.2.0 开始按能力拆模块，但不一次性完成 v1.0.0。拆包以依赖方向和已出现的能力压力为准。

```text
packages/
  agent/       Agent, Session, Task, Tool, Verifier, Events
  cli/        command interface
  trace/      trace reader, replay, fork
  aci/        workspace tools
  eval/       datasets and scorers
  workflow/   graph executor
  adapters/   real model providers
```

### 12.1 拆包条件

| 条件 | v0.2.0 处理方式 |
|---|---|
| v0.0.0 API 稳定 | 冻结 `agent` public exports，并把内部 import 迁移到 package 入口 |
| 至少一个真实模型 adapter 完成 | 将 OpenAI-compatible runtime 迁入 `packages/adapters` |
| workspace ACI 开始引入多工具 | 新增 `packages/aci`，先提供 read/list/search，再设计 diff/patch/test |
| trace 不再只是 writer，需要 reader/replay | 将 JSONL writer 迁入 `packages/trace`，新增 reader 和 inspect；完整 replay/fork 后置 |

### 12.2 Package Dependency Direction

```text
cli
  -> agent
  -> adapters
  -> trace
  -> aci

adapters -> agent
trace    -> agent
aci      -> agent

eval     -> agent, trace
workflow -> agent

agent     -> no Rowan package dependency
```

规则：

- `agent` 不依赖任何其他 Rowan package。
- `adapters` 只把 provider response 映射成 `agent` 的 `StreamFn` events。
- `trace` 只消费 `agent` 的 `AgentEvent`，不执行 agent。
- `aci` 只暴露 `agent.Tool`，不直接控制 agent loop。
- `cli` 是组合层，可以依赖所有运行时 package。
- `eval` 和 `workflow` 在 v0.2.0 不进入主链路，保留到后续版本。

### 12.3 v0.2.0 拆包范围

v0.2.0 目标结构：

```text
packages/
  agent/       existing agent kernel
  adapters/   existing OpenAI-compatible adapter
  trace/      existing JSONL writer + new reader/inspect
  aci/        new workspace tools
  cli/        existing CLI composition
```

v0.2.0 不做完整 `eval`、`workflow`，也不做完整 trace replay/fork。

## 13. v0.1.0 Real Model Runtime

v0.1.0 在 v0.0.0 的 `StreamFn` 边界上增加真实模型接入：

```text
Agent Loop
  -> OpenAI-compatible StreamFn
  -> Chat Completions fetch client
  -> JSON extraction
  -> TypeBox validation
  -> ModelStreamEvent
```

v0.1.0 不改变 `Agent`、`Session`、`Task`、`Tool`、`Verifier`、`Outcome`。

### 13.1 OpenAI-compatible StreamFn

```ts
function createOpenAICompatibleStream(config: OpenAICompatibleConfig): StreamFn
```

Config:

```ts
interface OpenAICompatibleConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  timeoutMs?: number;
  fetch?: typeof fetch;
}
```

每个 phase 都通过 JSON contract 映射回 v0.0.0 events：

| Phase | Model Output | Rowan Event |
|---|---|---|
| route | `{ message, needsTask }` JSON | `text_delta` + `structured_output` |
| plan | Task JSON | `structured_output` |
| execute | message + toolCalls JSON | `text_delta` + `tool_call` |
| verify | VerificationResult JSON | `structured_output` |

### 13.2 Provider Strategy

v0.1.0 只做 OpenAI-compatible Chat Completions：

- `POST /v1/chat/completions`
- `response_format: { type: "json_object" }` 可配置启用/禁用
- prompt 仍要求只输出 JSON
- 不做 native tool calling 兼容矩阵
- 不做 Anthropic/Gemini

## 14. Architecture Decisions

| ADR | Decision | v0.0.0 Default |
|---|---|---|
| ADR-0001 | Runtime | TypeScript + Bun |
| ADR-0002 | Project shape | Single package |
| ADR-0003 | Schema | TypeBox 1.x + `Schema.Compile()` |
| ADR-0004 | Model abstraction | `StreamFn` |
| ADR-0005 | Tool collection | `Tool[]` |
| ADR-0006 | Policy | hooks first |
| ADR-0007 | Trace | JSONL subscriber |
| ADR-0008 | Skill | `SKILL.md` |
| ADR-0009 | First real model runtime | OpenAI-compatible `StreamFn` |
