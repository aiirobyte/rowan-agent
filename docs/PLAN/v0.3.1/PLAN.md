# Rowan v0.3.1 Plan

> 版本：v0.3.1
> 日期：2026-05-01
> 状态：completed
> 基线：v0.3.0 Agent Mechanism + Sub Session
> 任务表：`docs/PLAN/v0.3.1/TASKS.md`

## 1. v0.3.1 目标

v0.3.1 的目标是把 Rowan 从“一次命令一次临时 Session”升级为“可持续的多轮 Session”。

当前 v0.3.0 行为：

```text
CLI prompt
  -> new Agent
  -> new Session
  -> route/direct 或 route/task
  -> outcome
  -> trace jsonl
```

v0.3.1 目标行为：

```text
CLI prompt --session <id>
  -> load existing Session
  -> append user turn
  -> run same Agent loop
  -> append assistant/tool/log events
  -> persist Session
  -> write trace for this turn
```

也就是说，`Session` 不再只是单次 run 的内存对象，而是可以跨 CLI 调用恢复、追加和继续对话的会话容器。

## 2. Product Shape

v0.3.1 优先支持 CLI 多轮对话，不做 UI。

推荐的 CLI 体验：

```bash
bun run rowan chat
bun run rowan chat --session ses_abc123
bun run rowan sessions list
bun run rowan sessions show ses_abc123
bun run rowan sessions delete ses_abc123
```

同时保留单次 prompt 模式：

```bash
bun run rowan "hello"
```

单次 prompt 默认仍然创建一个新 Session；如果传入 `--session`，则在已有 Session 上追加一轮：

```bash
bun run rowan --session ses_abc123 "继续刚才的问题"
```

## 3. Persistent Session Store

新增 `SessionStore` 抽象，先提供本地文件实现。

建议目录：

```text
<workspace>/
  sessions/
    ses_abc123.json
  runs/
    2026-05-01T223858-42+08:00-ses_abc123.jsonl
```

Session 文件保存稳定业务状态：

```ts
type PersistedSession = {
  id: string;
  parentSessionId?: string;
  systemPrompt: string;
  messages: AgentMessage[];
  skills: Skill[];
  createdAt: string;
  updatedAt: string;
  title?: string;
};
```

不把完整 trace log 放入 Session 文件。`log` 继续属于当前执行上下文的运行记录，并写入 JSONL trace。这样 Session 文件负责多轮上下文，trace 文件负责复盘一次执行入口。

## 4. Agent Multi-turn Semantics

当前 `Agent.prompt(input)` 会创建新 Session。v0.3.1 需要改成：

- 如果 Agent 没有现有 Session，则创建新 Session。
- 如果 Agent 已有 Session，则追加新的 user message。
- 每轮 run 仍然调用同一套 `runAgentLoop()`。
- 每轮 run 的 `session.userInput` 表示本轮用户输入。
- `session.messages` 保留跨轮模型上下文。
- `session.log` 可以只记录当前内存里的累计事件；持久化时不依赖它作为主存储。

新增或调整 API：

```ts
type AgentOptions = {
  session?: Session;
  sessionStore?: SessionStore;
};

class Agent {
  prompt(input: string): Promise<Outcome>;
  loadSession(sessionId: string): Promise<void>;
  saveSession(): Promise<void>;
}
```

可以先不引入复杂 lifecycle。最小原则是：每轮 prompt 后保存 Session。

## 5. Conversation Context Rules

多轮 Session 的关键不是把全部历史无脑塞给模型，而是先建立正确的语义边界。

v0.3.1 先做：

- 保留所有用户消息、用户可见 assistant 消息、tool result 消息。
- 继续过滤内部 phase JSON，例如 route/plan/execute 的 raw model JSON。
- 每轮 route/plan/execute/verify prompt 仍作为 trace message，不持久化为普通 conversation message。
- Direct response 的 assistant answer 要进入 `session.messages`，让下一轮能引用。
- Task verify 的最终 `message` 要进入 `session.messages`，让下一轮能引用。

不在 v0.3.1 做：

- long-term memory。
- summary compression。
- vector retrieval。
- token budget truncation 策略。
- cross-session search。

## 6. CLI Interaction

CLI 需要新增两种模式。

### 6.1 Session-aware one-shot

```bash
bun run rowan --session ses_abc123 "继续"
```

行为：

- 加载 `sessions/ses_abc123.json`。
- 把 prompt 作为新一轮 user message。
- 输出本轮 outcome。
- 保存 Session。
- 仍然为本轮写一份 trace。

### 6.2 Interactive chat

```bash
bun run rowan chat
```

行为：

- 启动或加载 Session。
- 显示 session id。
- 从 stdin 循环读取用户输入。
- 每轮调用 `agent.prompt(input)`。
- 支持 `:exit` / `:quit` 退出。
- 支持 `:session` 显示当前 session id。

v0.3.1 的 chat 模式可以保持朴素，不需要 readline 高级补全、流式 token UI 或 TUI。

## 7. Trace Relationship

每次进入一个 Session 执行上下文都会产生一份带时间戳的 trace 文件，文件名使用 session id，而不是额外的 run id。`rowan chat` 同一进程内的多轮对话 append 到同一份 trace；重新通过 CLI 显式 load 同一个 Session 时，会新增一份带新时间戳、相同 session id、以 `session_loaded` 开头的 JSONL。

要求：

- `session_created` 或新增 `session_loaded` 事件包含 session id。
- 每个 trace 文件可通过 inspector 看到 session id。
- 同一 chat 进程内的后续 prompt 不再产生新的 trace 文件，也不再产生新的 `session_loaded` 起始事件。
- `sessions list` 可显示最近更新时间和最近一条消息摘要。
- 不要求 trace replay 能恢复完整 Session；replay 留给后续版本。

## 8. Package Boundary

Session 数据模型和 Store 抽象已拆到独立 `@rowan-agent/session` 包：

- `packages/session/src/session.ts` 定义 `Session`、`AgentMessage`、`Skill`、schema version 和构造工具。
- `packages/session/src/session-store.ts` 定义 `SessionStore`、持久化 JSON schema、序列化/反序列化和内存实现。
- `packages/cli/src/session-store.ts` 只保留 workspace 本地 JSON 文件实现。
- `packages/agent` 依赖 `@rowan-agent/session`，只负责 agent loop 与 sub-session 执行语义。

## 9. Not In v0.3.1

- 不做长期 memory。
- 不做自动摘要。
- 不做跨 Session 检索。
- 不做 Web UI。
- 不做 trace replay / fork。
- 不做多人协作 Session。
- 不做 Session schema migration 框架；只保留 `version` 字段和单版本解析。

## 10. Acceptance Criteria

- `Agent.prompt()` 可在同一个 `Session` 中连续调用多次。
- 第二轮模型上下文包含第一轮用户输入和最终 assistant answer。
- CLI 支持 `--session <id>` 继续会话。
- CLI 支持 `sessions list/show/delete`。
- CLI 支持最小 `chat` 交互模式。
- Session 文件写入 `<workspace>/sessions/<session-id>.json`。
- 每次 CLI 显式进入 Session 写一份 timestamped trace；同一 chat 进程内后续轮次 append 到当前 trace。
- `bun test packages` 和 `bun run build` 通过。
