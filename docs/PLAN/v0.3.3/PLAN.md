# Rowan v0.3.3 Plan

> 版本：v0.3.3
> 日期：2026-05-03
> 状态：planned
> 基线：v0.3.2 Threaded Sub Agent Sessions
> 任务表：`docs/PLAN/v0.3.3/TASKS.md`

## 1. v0.3.3 目标

v0.3.3 的目标是先完成 Rowan 的存储边界升级：

```text
AgentStore port
  -> JSON-backed store
  -> conversation-scoped session messages
  -> steps / execution-scoped history
  -> phase-specific context scope
```

这不是 DB 版本，也不是完整 DCP/IR 版本。v0.3.3 只解决一个更基础的问题：当前 `session.messages` 仍然混合了用户/助手对话、phase prompt、routing decision、planner/execute/verifier 内部输出和 tool result。v0.3.3 要把这些内容按 scope 分层存储，让 prompt builder 按 phase 显式选择上下文。

核心原则：

- `session.messages` 只承载可进入未来对话上下文的消息。
- route / plan / execute / verify 的模型输出、structured output、tool calls、tool results 进入 `ExecutionTurn`。
- trace 继续完整记录运行过程。
- JSON 是当前承载层；`AgentStore` 是长期端口，后续可以替换为 sidecar JSONL 或 SQLite。

## 2. Storage Port

新增 `AgentStore`，作为比当前 `SessionStore` 更完整的存储端口。

建议类型：

```ts
type AgentStore<TSession extends Session<unknown> = Session<unknown>> =
  SessionStore<TSession> & {
    appendStep(sessionId: string, step: ExecutionTurn): Promise<void>;
    loadSteps(sessionId: string, filter?: StepFilter): Promise<ExecutionTurn[]>;
  };
```

实际实现优先保留现有 `SessionStore` 方法名：

```ts
type SessionStore<TSession extends Session<unknown> = Session<unknown>> = {
  create(session: TSession): Promise<TSession>;
  load(id: string): Promise<TSession | undefined>;
  save(session: TSession): Promise<void>;
  list(): Promise<SessionListItem[]>;
  delete(id: string): Promise<boolean>;
};
```

替换策略：

- `AgentStore` 直接替换 CLI 当前 `SessionStore` 使用路径。
- `Agent` 只接收 `agentStore`；不再新增 `sessionStore` 兼容入口。
- CLI 使用 JSON-backed `LocalJsonAgentStore`。
- tests 使用 `InMemoryAgentStore`。

## 3. ExecutionTurn Model

v0.3.3 不引入完整 provider IR，先定义 Rowan-native 的 ExecutionTurn。

建议类型：

```ts
type ContextScope = "conversation" | "execution" | "diagnostic";

type ExecutionTurn = {
  id: string;
  sessionId: string;
  parentSessionId?: string;
  phase: "route" | "plan" | "execute" | "verify";
  requestedAtMs: number;
  completedAtMs: number;
  model: ModelRef;
  usage?: ModelCallUsage;
  scope: ContextScope;
  entries: ExecutionTurnEntry[];
};

type ExecutionTurnEntry =
  | { kind: "prompt"; message: Pick<AgentMessage, "role" | "content"> }
  | { kind: "assistant_text"; text: string }
  | { kind: "structured_output"; content: unknown }
  | { kind: "tool_call"; toolCall: ToolCall }
  | { kind: "tool_result"; result: ToolResult };

type StepFilter = {
  phase?: ExecutionTurn["phase"];
  afterMs?: number;
  scope?: ContextScope;
};
```

默认 scope：

| 来源 | 默认 scope | 说明 |
|---|---|---|
| route prompt/output | `execution` | 只供调度和调试，不进入未来 conversation context |
| plan prompt/output | `execution` | 只供当前 task 执行 |
| execute assistant text/tool call/tool result | `execution` | 当前 task 可见，未来 route 默认不可见 |
| verify prompt/output | `execution` | 只用于验收 |
| direct answer | `conversation` | 作为用户可见 assistant message 发布 |
| accepted final outcome | `conversation` | 作为用户可见 assistant message 发布 |
| errors/budget/debug | `diagnostic` | trace 可见，prompt 默认不可见 |

## 4. JSON-backed Store

v0.3.3 先继续使用 `<workspace>/sessions/<session-id>.json`，但升级文件 schema。

建议 schema：

```ts
type PersistedAgentState = {
  version: "0.3.3";
  id: string;
  parentSessionId?: string;
  systemPrompt: string;
  input: string;
  task?: string;
  goal?: string;
  messages: AgentMessage[];      // conversation-scoped user/assistant messages only
  steps: ExecutionTurn[];        // execution and diagnostic history, plus optional conversation steps
  skills: Skill[];
  createdAt: string;
  updatedAt: string;
  title?: string;
};
```

实现要求：

- JSON-backed store 对外暴露 `AgentStore`，内部可以继续整文件原子写。
- `appendStep()` 在 JSON 实现中可以 load -> append -> atomic save；当前规模足够。
- `deleteSession()` 删除同一个 JSON 文件即可。
- `listSessions()` 只读取 session metadata，不暴露 step 内容。
- 后续如果 steps 变大，可把 `steps` 迁到 `sessions/<id>.steps.jsonl`，但端口不变。

## 5. Session Message Scope

`AgentMessage.metadata` 增加约定字段：

```ts
type ContextScope = "conversation" | "execution" | "diagnostic";

type AgentMessageMetadata = {
  kind?: string;
  phase?: LlmPhase;
  scope?: ContextScope;
  [key: string]: unknown;
};
```

写入规则：

- user turn 默认 `conversation`。
- direct assistant answer 默认 `conversation`。
- accepted final outcome 默认 `conversation`。
- `phase_prompt`、`routing_decision`、planner/verifier raw output 默认不写入 `session.messages`，只进入 `ExecutionTurn` 和 trace。
- tool result 默认不写入 `session.messages`，只进入 `ExecutionTurn` 和 trace。
- 如果测试或 trace snapshot 必须构造 `AgentMessage`，也必须标 `execution` 或 `diagnostic`。

读取规则：

- prompt builder 不再扫描所有 `session.messages`。
- route / plan / execute / verify 都通过 phase-specific allowlist 获取上下文。
- v0.3.3 新写入的消息必须带 `metadata.scope`。
- 没有 `metadata.scope` 的旧格式消息不参与 prompt builder；本版本不做旧 schema 自动迁移。

## 6. Agent Loop Changes

当前 `collectTextAndStructured()` 会把 prompt message、assistant text、tool result 通过 `appendSessionMessage()` 写入 `session.messages`。v0.3.3 需要拆成两条路径：

```text
publish conversation message
  -> session.messages
  -> trace message_delta

record step
  -> AgentStore.appendStep()
  -> trace events/message_delta
```

调整点：

- route phase 收集到的 prompt、structured output、routing decision 写入 `ExecutionTurn`。
- plan phase 收集到的 task JSON 写入 `ExecutionTurn`，不作为 assistant conversation。
- execute phase 的 assistant text、tool calls、tool results 写入 `ExecutionTurn`。
- verify phase 的 verification result 写入 `ExecutionTurn`。
- direct route 的 `message` 需要发布为 `conversation` scope 的 assistant message。
- task passed/final outcome 的 `message` 需要发布为 `conversation` scope 的 assistant message。
- failed outcome 默认不发布为对话消息；只作为 trace outcome / `diagnostic` step。

这样可以让 `session.messages` 更接近真正的聊天历史，而不是运行过程转储。

## 7. Prompt Builder Changes

`packages/context` 需要从“过滤消息数组”改成“按 phase 渲染 conversation context + 当前 phase 指令”。

v0.3.3 的最小版本不必实现完整 `RenderedAgentContext` 类型，但要建立 allowlist：

| Phase | 可见内容 |
|---|---|
| route | system prompt、`conversation` scope 的 user/assistant messages、current user request、session task/goal、skills/tool summary |
| plan | `conversation` scope 的 messages、current user request、session task/goal、available tools/skills |
| execute | task、allowed tools、当前 task 的 tool results、必要的 `conversation` messages |
| verify | task、criteria、task output、必要的 step evidence |

明确禁止：

- routing JSON 进入 route。
- phase prompt 进入任何 phase。
- failed outcome 进入 route。
- verifier 内部失败文案进入 route。
- unrelated tool result 进入 route/plan。

## 8. Schema Replacement Strategy

v0.3.3 不做 legacy migration，也不保证旧 session JSON 能被自动读取。实现上直接把本地持久化模型替换为 v0.3.3 schema。

加载策略：

1. 读取 JSON 后先检查 `version === "0.3.3"`。
2. 校验 `messages`、`steps`、`createdAt`、`updatedAt` 等字段是否存在且类型正确。
3. 旧版本或无版本文件直接返回不可加载错误。
4. CLI 遇到不可加载 session 时提示用户创建新 session 或手工处理旧文件。
5. 新写入文件全部使用 v0.3.3 schema。

替换优先级：

- P0：新 session 从第一轮开始就只有 clean `messages` + `steps`。
- P1：所有 store 和 CLI 路径都只写 v0.3.3 schema。
- P2：不可加载旧文件时给出清晰错误，不做隐式修复。

## 9. Trace Relationship

Trace 仍是完整运行记录，不因 `session.messages` 变干净而丢信息。

要求：

- `message_delta` 可以继续记录 phase prompt / model text，但 delta 必须带 metadata scope。
- `model_requested` 仍只记录 usage 和 message count，不记录完整 raw prompt。
- `tool_requested` / `tool_end` 保持不变。
- 新增或复用事件时，trace inspector 能显示 step phase 和 scope。
- `chat_start.content` 应反映本轮模型可见上下文或 session 对话上下文，避免误导为完整 trace。

## 10. Implementation Sketch

### 10.1 Package Boundary

保持现有依赖方向：

```text
cli -> agent -> session
trace -> agent
adapters -> agent
```

因此：

- `packages/session` 只放通用 `Session`、`AgentMessage`、`SessionStore`、scope helper。
- `packages/agent` 放 `ExecutionTurn`、`AgentStore`、agent loop 对 step 的写入逻辑。
- `packages/cli` 放 `LocalJsonAgentStore`，因为它依赖文件系统和 workspace 路径。
- `packages/session` 不 import `@rowan-agent/agent`，避免循环依赖。

### 10.2 Types

`packages/session/src/session.ts` 增加轻量 scope 类型和 helper：

```ts
export type ContextScope = "conversation" | "execution" | "diagnostic";

export type AgentMessageMetadata = Record<string, unknown> & {
  kind?: string;
  phase?: string;
  scope?: ContextScope;
};

export function messageScope(message: AgentMessage): ContextScope {
  const metadata = message.metadata as AgentMessageMetadata | undefined;
  if (metadata?.scope === "conversation" || metadata?.scope === "execution" || metadata?.scope === "diagnostic") {
    return metadata.scope;
  }

  if (message.role === "user") {
    return "conversation";
  }
  if (message.role === "tool") {
    return "execution";
  }
  if (metadata?.kind === "phase_prompt" || metadata?.kind === "routing_decision") {
    return "execution";
  }
  if (metadata?.kind === "error" || metadata?.kind === "budget_exceeded") {
    return "diagnostic";
  }

  return message.role === "assistant" ? "conversation" : "execution";
}

export function isConversationMessage(message: AgentMessage): boolean {
  return messageScope(message) === "conversation";
}
```

`packages/agent/src/store.ts` 新增 agent-domain storage types：

```ts
import type { AgentMessage, ContextScope, Session, SessionStore } from "@rowan-agent/session";
import type { LlmPhase, ModelCallUsage, ModelRef, ToolCall, ToolResult } from "./types";

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

export type StepFilter = {
  phase?: LlmPhase;
  afterMs?: number;
  scope?: ContextScope;
};

export type AgentStore<TSession extends Session<unknown> = Session<unknown>> =
  SessionStore<TSession> & {
    appendStep(sessionId: string, step: ExecutionTurn): Promise<void>;
    loadSteps(sessionId: string, filter?: StepFilter): Promise<ExecutionTurn[]>;
  };
```

### 10.3 JSON-backed Store

`packages/cli/src/session-store.ts` 会从 `LocalJsonSessionStore` 升级为 `LocalJsonAgentStore`。文件仍是一个 JSON，内部多一个 `steps` 字段。

核心读写形态：

```ts
type PersistedAgentState = PersistedSession & {
  steps?: ExecutionTurn[];
};

function toPersistedAgentState(
  session: Session<unknown>,
  steps: ExecutionTurn[],
): PersistedAgentState {
  return {
    ...toPersistedSession(session),
    steps,
  };
}

function filterSteps(steps: ExecutionTurn[], filter: StepFilter = {}): ExecutionTurn[] {
  return steps.filter((step) => {
    if (filter.phase && step.phase !== filter.phase) return false;
    if (filter.scope && step.scope !== filter.scope) return false;
    if (filter.afterMs !== undefined && step.requestedAtMs < filter.afterMs) return false;
    return true;
  });
}
```

写 session 时保留已有 steps，避免 `Agent.saveSession()` 覆盖内部历史：

```ts
async save(session: AgentSession): Promise<void> {
  const existing = await this.readState(session.id);
  await this.writeState(
    session.id,
    toPersistedAgentState(session, existing?.steps ?? []),
  );
}
```

追加 step 时读取同一个文件、追加、原子写回：

```ts
async appendStep(sessionId: string, step: ExecutionTurn): Promise<void> {
  const state = await this.readState(sessionId);
  if (!state) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  await this.writeState(sessionId, {
    ...state,
    steps: [...(state.steps ?? []), step],
    updatedAt: nowIso(),
  });
}

async loadSteps(sessionId: string, filter?: StepFilter): Promise<ExecutionTurn[]> {
  const state = await this.readState(sessionId);
  return state ? filterSteps(state.steps ?? [], filter) : [];
}
```

`writeState()` 继续沿用当前临时文件 + `rename()` 原子替换策略。

### 10.4 Schema Replacement

加载时只接受 v0.3.3 schema。旧文件不迁移，不进入 prompt builder，也不写回修复。

```ts
function parsePersistedAgentState(value: unknown): PersistedAgentState {
  const parsed = PersistedAgentStateSchema.parse(value);

  if (parsed.version !== "0.3.3") {
    throw new Error(`Unsupported session schema version: ${parsed.version}`);
  }

  return parsed;
}

async load(id: string): Promise<AgentSession | undefined> {
  const state = await this.readState(id);
  if (!state) return undefined;
  return sessionFromPersistedAgentState(state);
}
```

写入时没有双 schema 分支：

```ts
function toPersistedAgentState(
  session: AgentSession,
  steps: ExecutionTurn[],
): PersistedAgentState {
  return {
    version: "0.3.3",
    ...session,
    messages: session.messages.filter(isConversationMessage),
    steps,
  };
}
```

### 10.5 Agent Loop Recording

`AgentOptions` 使用 `agentStore` 作为唯一持久化端口：

```ts
export type AgentOptions = {
  systemPrompt: string;
  model: ModelRef;
  stream: StreamFn;
  agentStore: AgentStore<AgentSession>;
};
```

`runAgentLoop()` 不直接知道文件系统。它只接收一个 callback：

```ts
type AgentLoopInput = {
  // existing fields...
  recordStep?: (step: ExecutionTurn) => Promise<void>;
};
```

在 `collectTextAndStructured()` 中，不再把 execution prompt/text 写入 `session.messages`，而是收集 step entries，同时仍写 trace：

```ts
async function collectTextAndStructured(input: {
  loop: AgentLoopRuntime;
  events: AsyncIterable<ModelStreamEvent>;
  metadataPhase: LlmPhase;
  traceText?: boolean;
}): Promise<{
  text: string;
  structured?: unknown;
  toolCalls: ToolCall[];
  stepEntries: ExecutionTurnEntry[];
  usage?: ModelCallUsage;
}> {
  const stepEntries: ExecutionTurnEntry[] = [];
  const toolCalls: ToolCall[] = [];
  let text = "";
  let flushedText = "";
  let structured: unknown;
  let usage: ModelCallUsage | undefined;

  const flushText = async () => {
    if (!text) return;
    flushedText += text;
    stepEntries.push({ kind: "assistant_text", text });
    await appendTraceMessage(
      input.loop,
      createMessage("assistant", text, {
        kind: "model_message",
        phase: input.metadataPhase,
        scope: "execution",
      }),
    );
    text = "";
  };

  for await (const event of input.events) {
    if (event.type === "prompt_message") {
      stepEntries.push({ kind: "prompt", message: event.message });
      await appendTraceMessage(
        input.loop,
        createMessage(event.message.role, event.message.content, {
          kind: "phase_prompt",
          phase: event.phase,
          scope: "execution",
        }),
      );
    }

    if (event.type === "model_requested") {
      usage = event.usage;
      await emit(input.loop, {
        type: "model_requested",
        phase: event.phase,
        model: event.model,
        usage: event.usage,
        ts: nowIso(),
      });
    }

    if (event.type === "text_delta") text += event.text;

    if (event.type === "structured_output") {
      await flushText();
      structured = event.content;
      stepEntries.push({ kind: "structured_output", content: event.content });
    }

    if (event.type === "tool_call") {
      await flushText();
      const toolCall = Validators.toolCall.Parse(event.toolCall);
      toolCalls.push(toolCall);
      stepEntries.push({ kind: "tool_call", toolCall });
    }
  }

  await flushText();
  return { text: flushedText, structured, toolCalls, stepEntries, usage };
}
```

每个 phase 完成后记录一个 `ExecutionTurn`：

```ts
async function recordPhaseStep(input: {
  loop: AgentLoopRuntime;
  phase: LlmPhase;
  requestedAtMs: number;
  entries: ExecutionTurnEntry[];
  usage?: ModelCallUsage;
  scope?: ContextScope;
}): Promise<void> {
  if (!input.loop.recordStep || input.entries.length === 0) return;

  await input.loop.recordStep({
    id: createId("step"),
    sessionId: input.loop.session.id,
    parentSessionId: input.loop.session.parentSessionId,
    phase: input.phase,
    requestedAtMs: input.requestedAtMs,
    completedAtMs: Date.now(),
    model: input.loop.model,
    usage: input.usage,
    scope: input.scope ?? "execution",
    entries: input.entries,
  });
}
```

工具结果也加入当前 execute turn：

```ts
for (const toolCall of collected.toolCalls) {
  const result = await executeToolCall({ loop: input, task, toolCall });
  toolResults.push(result);
  collected.stepEntries.push({ kind: "tool_result", result });

  await appendTraceMessage(
    input,
    createMessage("tool", JSON.stringify(result), {
      toolCallId: result.toolCallId,
      toolName: result.toolName,
      scope: "execution",
    }),
  );
}
```

### 10.6 Conversation Publishing

新增一个很小的 helper，把用户可见回答写入 `session.messages`：

```ts
async function publishConversationAssistantMessage(
  input: AgentLoopRuntime,
  content: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await appendSessionMessage(
    input,
    createMessage("assistant", content, {
      ...metadata,
      scope: "conversation",
    }),
  );
}
```

使用位置：

```ts
if (routed.route === "direct") {
  await publishConversationAssistantMessage(runtime, routed.message, { kind: "direct_answer" });
  const outcome = createDirectOutcome(routed.message);
  // emit outcome...
}

if (lastVerification?.passed) {
  const outcome = createOutcome(task, lastVerification);
  await publishConversationAssistantMessage(runtime, outcome.message, {
    kind: "task_outcome",
    taskId: task.id,
  });
  // emit outcome...
}
```

失败 outcome 不调用这个 helper，只发 trace `outcome` 和 diagnostic step。

### 10.7 Prompt Builder Allowlist

`packages/context/src/prompt-builder.ts` 的第一步先替换现有 `toConversationMessage()` 过滤逻辑：

```ts
function buildConversationMessages(context: LlmContext): ChatMessage[] {
  return context.session.messages
    .filter(isConversationMessage)
    .flatMap((message) => {
      const chatMessage = toConversationMessage(message);
      return chatMessage ? [chatMessage] : [];
    });
}
```

再按 phase 细分：

```ts
function conversationForPhase(context: LlmContext): AgentMessage[] {
  const conversation = context.session.messages.filter(isConversationMessage);

  if (context.phase === "route") {
    return conversation.slice(-12);
  }

  if (context.phase === "plan") {
    return conversation.slice(-20);
  }

  if (context.phase === "execute") {
    return conversation.slice(-8);
  }

  return conversation.slice(-8);
}
```

`execute` 和 `verify` 的 tool/task evidence 继续来自 `LlmContext` 的 `toolResults` / `taskOutput`，不要从历史 `session.messages` 里挖。

## 11. Acceptance Criteria

- 新增 `AgentStore` port，覆盖 session CRUD 和 step append/load。
- 新增 JSON-backed `LocalJsonAgentStore`，替换 CLI 当前 `LocalJsonSessionStore` 使用路径。
- 新增 `InMemoryAgentStore` 测试实现。
- Persisted session schema 升级到 v0.3.3，包含 `steps`。
- 旧 session schema 不自动迁移；加载旧文件时给出明确错误。
- 新写入的 `session.messages` 只包含 conversation-scoped user/assistant messages。
- route / plan / execute / verify execution outputs 写入 steps。
- prompt builder 使用 phase-specific allowlist。
- 回归测试覆盖：
  - failed outcome 不污染下一轮 route。
  - routing decision 不污染下一轮 route。
  - phase prompt 不持久化为 conversation message。
  - tool result 不进入 unrelated route/plan prompt。
- old-schema session 不会被隐式加载进 prompt builder。
- `bun test packages` 和 `bun run build` 通过。

## 12. Not In v0.3.3

- 不引入 SQLite / Drizzle / DB migration。
- 不做旧版 session migration。
- 不做完整 DCP Projection/Rendering package。
- 不做 provider-agnostic `ConversationEntry[]` IR。
- 不做 compaction cursor 和 summary。
- 不做 trace replay / fork。
- 不做 workflow DAG。
- 不改变工具权限模型；PolicyEngine 仍留给 v0.4.0。
