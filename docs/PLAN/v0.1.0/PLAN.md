# Rowan v0.1.0 Plan

> 版本：v0.1.0
> 日期：2026-05-01
> 状态：已实现，待真实 API 手动验收
> 技术栈：TypeScript + Bun
> 基线：v0.0.0 Minimal Agent Kernel
> 任务表：`docs/PLAN/v0.1.0/TASKS.md`

## 1. v0.1.0 目标

v0.1.0 的目标是给 v0.0.0 接入第一个真实模型运行时。

范围只做：

```text
OpenAI-compatible Chat Completions
  -> Rowan StreamFn
  -> Task / ToolCall / VerificationResult
```

v0.1.0 不做 provider registry，不做 Anthropic/Gemini，不做 SDK 依赖，不做 native tool calling 的复杂兼容层。

## 2. 核心原则

1. 不改变 v0.0.0 的核心对象：`Agent`、`Session`、`Task`、`Tool`、`Verifier`、`Outcome`。
2. 真实模型只通过新的 `StreamFn` 接入。
3. 不引入 OpenAI SDK；先用 `fetch` 调 OpenAI-compatible `/v1/chat/completions`。
4. 不默认依赖 provider 的 native tool calling；优先用 JSON contract 让模型输出结构化结果。
5. 继续使用 TypeBox 1.x `Schema.Compile()` 校验模型输出。
6. 所有真实模型调用都必须可测试：通过 mock fetch，不依赖真实 API。

## 3. v0.1.0 范围

### 3.1 必做

- `createOpenAICompatibleStream()`。
- OpenAI-compatible client。
- Phase-specific prompt builder：
  - plan phase -> `Task`
  - execute phase -> `ToolCall[]` 或 message
  - verify phase -> `VerificationResult`
- JSON extraction and parsing。
- TypeBox validation on model structured output。
- CLI 参数：
  - `--base-url`
  - `--api-key`
  - `--model`
- 环境变量读取：
  - `ROWAN_OPENAI_BASE_URL`
  - `ROWAN_OPENAI_API_KEY`
  - `ROWAN_MODEL`
- Mock fetch tests。
- 错误处理：
  - missing API key
  - HTTP error
  - invalid JSON
  - invalid schema
  - model refuses / empty output
- README quickstart。

### 3.2 不做

- 不做 Anthropic adapter。
- 不做 Gemini adapter。
- 不做 provider registry。
- 不做 OpenAI SDK。
- 不做 Responses API 专属实现。
- 不做 native tool calling 兼容矩阵。
- 不做 streaming SSE token parser，除非实现成本很低。
- 不做 real model eval。
- 不做 workspace ACI。

## 4. 设计决策

| 决策点 | v0.1.0 决策 |
|---|---|
| 首个真实模型 | OpenAI-compatible Chat Completions |
| 接入方式 | `fetch` |
| 抽象边界 | `StreamFn` |
| 输出协议 | JSON contract + TypeBox validation |
| 默认 endpoint | `${baseUrl}/chat/completions` |
| 默认 base URL | 读取 `ROWAN_OPENAI_BASE_URL` |
| 默认 model | 读取 `ROWAN_MODEL` |
| API key | 读取 `ROWAN_OPENAI_API_KEY` |
| Tool calling | v0.1.0 默认 prompt-json；native tool calling 后置 |
| Streaming | v0.1.0 可以先非 SSE；仍返回 AsyncIterable events |

## 5. 目标文件

```text
src/
  openai-compatible.ts
  prompt-builder.ts
  json-extract.ts
  cli.ts

test/
  openai-compatible.test.ts
  prompt-builder.test.ts
  json-extract.test.ts
  cli-real-model.test.ts
```

可以后续再拆：

```text
src/adapters/openai-compatible.ts
src/model/prompt-builder.ts
```

v0.1.0 仍保持单包结构。

## 6. OpenAI-compatible Client

### 6.1 Config

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

### 6.2 Config Resolution

用户可以通过三种方式提供真实模型配置：

1. 项目根目录 `.env`，推荐本地开发使用。
2. 当前 shell 的 `export` 环境变量，适合一次性测试或 CI。
3. CLI flags，适合临时覆盖。

项目提供 `.env.example` 作为模板：

```bash
cp .env.example .env
```

`.env` 内容：

```bash
ROWAN_OPENAI_BASE_URL=https://api.openai.com/v1
ROWAN_OPENAI_API_KEY=sk-...
ROWAN_MODEL=gpt-4.1-mini
```

Bun 会把 `.env`、shell env 暴露到 `Bun.env` / `process.env`。v0.1.0 实现时统一通过 resolver 读取，不让 client、CLI、stream 分散读取环境变量。

解析优先级：

```text
CLI flags > env vars > defaults
```

字段规则：

| 字段 | CLI flag | Env var | Default | Required |
|---|---|---|---|---|
| base URL | `--base-url` | `ROWAN_OPENAI_BASE_URL` | `https://api.openai.com/v1` | no |
| API key | `--api-key` | `ROWAN_OPENAI_API_KEY` | - | yes |
| model | `--model` | `ROWAN_MODEL` | - | yes |

建议实现：

```ts
type ResolveOpenAICompatibleConfigInput = {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  env?: Record<string, string | undefined>;
};

function resolveOpenAICompatibleConfig(input: ResolveOpenAICompatibleConfigInput) {
  const env = input.env ?? Bun.env;
  const baseUrl =
    input.baseUrl ?? env.ROWAN_OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  const apiKey = input.apiKey ?? env.ROWAN_OPENAI_API_KEY;
  const model = input.model ?? env.ROWAN_MODEL;

  if (!apiKey) {
    throw new Error("Missing API key: set ROWAN_OPENAI_API_KEY or pass --api-key.");
  }
  if (!model) {
    throw new Error("Missing model: set ROWAN_MODEL or pass --model.");
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey,
    model,
  };
}
```

安全约定：

- 真实 key 只写入 `.env`、shell env 或 CI secret。
- `.env` 不提交。
- `.env.example` 可以提交，但不能包含真实 key。
- Trace log 不记录 API key。

### 6.3 Request Shape

v0.1.0 使用 Chat Completions 风格请求：

```ts
{
  model: config.model,
  messages: [
    { role: "system", content: "runtime + JSON contract" },
    { role: "user", content: "original user message" },
    { role: "assistant", content: "prior assistant message" },
    { role: "user", content: "phase control prompt" }
  ],
  temperature: config.temperature ?? 0,
  response_format: { type: "json_object" }
}
```

Conversation history 作为 Chat Completions 的独立 `messages` 传入，不再拼接到 phase prompt 末尾。Phase prompt 只表达当前阶段的结构化输出契约、task/tools/toolResults 等控制信息。

Trace 中的 `model_call` 不记录完整输入输出内容，只记录一次模型调用的消息数量和 provider token usage：

```text
model_call
  -> phase
  -> model
  -> ts
  -> usage.inputMessages
  -> usage.inputTokens        // provider usage, if available
  -> usage.outputTokens       // provider usage, if available
  -> usage.totalTokens        // provider usage, if available
```

完整 conversation 由 `message_*` 事件表达：`message_start.content` 是初始 `session.messages` 数组，`message_delta.delta` 是新增的 `AgentMessage`，`message_delta.content` 是追加后的完整数组，`message_end.content` 是最终完整数组。`session_created` 不包含 messages、createdAt、updatedAt 或 messageCount，只保留 session 静态元信息。模型事件只保留 token 规模信息，避免 prompt 和 raw response 在 trace 中重复膨胀。

`response_format` 可能不是所有 OpenAI-compatible provider 都支持。v0.1.0 策略：

1. 默认带 `response_format: { type: "json_object" }`。
2. 如果 provider 返回不支持错误，允许通过 config 禁用。
3. prompt 本身仍明确要求“只输出 JSON”。

## 7. Phase Prompt Contract

v0.0.0 当前有三个 phase：

```text
plan
execute
verify
```

v0.1.0 为每个 phase 建立一个 JSON contract。

### 7.1 Plan Phase

Input:

- system prompt
- user input
- loaded skills
- available tools

Output:

```json
{
  "task": {
    "id": "task_model_generated_or_placeholder",
    "title": "string",
    "instruction": "string",
    "acceptanceCriteria": [
      {
        "id": "crit_1",
        "type": "model_judge",
        "description": "string",
        "required": true
      }
    ],
    "toolNames": ["echo"],
    "skillIds": [],
    "status": "pending",
    "attempts": 0
  }
}
```

Implementation detail:

- 如果模型省略 `id`，Rowan 可以补 id。
- 如果模型省略 `status` / `attempts`，Rowan 可以补默认值。
- 最终必须通过 `TaskSchema`。

### 7.2 Execute Phase

Input:

- task
- available tools
- prior tool results
- messages

Output:

```json
{
  "message": "optional assistant text",
  "toolCalls": [
    {
      "id": "call_1",
      "name": "echo",
      "args": {
        "message": "hello"
      }
    }
  ]
}
```

Implementation detail:

- `toolCalls` 为空表示不需要工具。
- 如果模型给了 unknown tool，沿用 v0.0.0 unknown tool 错误路径。
- 每个 tool call 必须过 `ToolCallSchema`。

### 7.3 Verify Phase

Input:

- task
- acceptance criteria
- tool results
- messages

Output:

```json
{
  "passed": true,
  "message": "why it passed or failed",
  "evidence": [],
  "failedCriteria": []
}
```

Implementation detail:

- 必须通过 `VerificationResultSchema`。
- v0.1.0 不做 scorer。

## 8. JSON Extraction

真实模型可能输出：

```text
```json
{ ... }
```
```

或夹杂自然语言。v0.1.0 需要一个小工具：

```ts
function extractJsonObject(text: string): unknown
```

策略：

1. 优先解析完整文本。
2. 尝试解析 fenced json block。
3. 尝试截取第一个 `{` 到最后一个 `}`。
4. 失败则返回 structured error。

## 9. StreamFn 映射

```ts
function createOpenAICompatibleStream(config: OpenAICompatibleConfig): StreamFn
```

行为：

```text
phase plan
  -> call chat completions
  -> yield model_call usage summary
  -> parse JSON
  -> yield text_delta if message exists
  -> yield structured_output Task
  -> yield done

phase execute
  -> call chat completions
  -> yield model_call usage summary
  -> parse JSON
  -> yield text_delta if message exists
  -> yield tool_call for each tool call
  -> yield done

phase verify
  -> call chat completions
  -> yield model_call usage summary
  -> parse JSON
  -> yield text_delta if message exists
  -> yield structured_output VerificationResult
  -> yield done
```

## 10. CLI

新增命令参数：

```bash
bun run rowan "hello"
bun run rowan --model gpt-4.1-mini "hello"
bun run rowan --base-url http://localhost:11434/v1 --model qwen "hello"
bun run rowan --trace .rowan/runs/real.jsonl "use echo tool"
```

Trace 默认行为：

```text
bun run rowan "hello"
  -> 自动写入 .rowan/runs/<YYYY-MM-DDTHHMMSS-CC+HH:MM>-run_<id>.jsonl
  -> 示例 .rowan/runs/2026-03-12T164018-22+08:00-run_12345678.jsonl

bun run rowan --trace .rowan/runs/real.jsonl "hello"
  -> 写入指定 trace 文件
```

默认 run 文件名和 JSONL 内部事件 `ts` 使用同一个本地时间格式化函数，并显式保留时区偏移；`CC` 是两位厘秒，避免时间戳过长。`--trace` 是覆盖路径，不是开启开关。v0.1.0 起 CLI 每次真实模型运行都应该有 trace，便于复盘 model_call、structured output、tool call、verification、outcome。

环境变量：

```bash
export ROWAN_OPENAI_BASE_URL="https://api.openai.com/v1"
export ROWAN_OPENAI_API_KEY="..."
export ROWAN_MODEL="..."
```

CLI 优先级：

```text
CLI flag > environment variable > default
```

## 11. Error Handling

| 错误 | 行为 |
|---|---|
| missing API key | CLI exit 1，清晰提示 |
| missing model | CLI exit 1，清晰提示 |
| HTTP 401/403 | 返回 provider auth error |
| HTTP 429/5xx | 返回 retryable model error |
| invalid JSON | 返回 parse error，包含截断后的原文 |
| invalid schema | 返回 schema error，提示缺失字段 |
| abort signal | 中断 fetch |

## 12. Tests

### 12.1 Unit Tests

- prompt builder:
  - plan prompt includes user input, skills, tools
  - execute prompt includes task and tool results
  - verify prompt includes criteria
- JSON extraction:
  - raw JSON
  - fenced JSON
  - JSON with surrounding text
  - invalid text
- OpenAI-compatible stream:
  - plan response -> `Task`
  - execute response -> `ToolCall`
  - verify response -> `VerificationResult`
  - HTTP error
  - invalid schema
  - abort

### 12.2 CLI Tests

- default real model mode missing API key returns exit 1。
- env vars are read。
- CLI flags override env vars。

### 12.3 Manual Test

```bash
bun run rowan "hello"
bun run rowan "use echo tool"
bun run rowan --trace .rowan/runs/real.jsonl "use echo tool"
```

## 13. Milestones

| Milestone | 名称 | 目标 | 退出标准 |
|---|---|---|---|
| M0 | Config and Prompts | 定义 config、prompt contract、JSON extraction | unit tests pass |
| M1 | Client | 实现 OpenAI-compatible fetch client | mock fetch tests pass |
| M2 | StreamFn | 实现 `createOpenAICompatibleStream()` | plan/execute/verify tests pass |
| M3 | CLI | 默认接入真实模型 | CLI config tests pass |
| M4 | Hardening | 错误处理、文档、manual checks | release checklist pass |

## 14. Release Checklist

- [ ] `bun test`
- [ ] `bun run build`
- [ ] mock real model tests 通过。
- [ ] default real model mode 能读取 env。
- [ ] missing API key 有清晰错误。
- [ ] 默认 trace 写入真实模型 run。
- [ ] `--trace <path>` 可覆盖默认 trace 路径。
- [ ] 文档包含 OpenAI-compatible quickstart。

## 15. 后置到 v0.2.0+

- Anthropic adapter。
- Gemini adapter。
- provider registry。
- native tool calling compatibility。
- streaming SSE parser。
- local model profiles。
- workspace ACI。
- eval harness。
