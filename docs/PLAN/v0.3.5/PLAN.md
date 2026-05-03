# Rowan v0.3.5 Plan

> 版本：v0.3.5
> 日期：2026-05-03
> 状态：planned
> 基线：v0.3.4 Store Package Consolidation
> 任务表：`docs/PLAN/v0.3.5/TASKS.md`

## 1. v0.3.5 目标

当前 `trace` 实现承担了两类职责：

1. Rowan 自己的领域事件建模：`AgentEvent`、`ExecutionTurn`、`Session.log`。
2. 将事件写成 JSONL 文件，并提供 reader / inspect。

v0.3.5 的目标是拆开这两层：

```text
agent/store/session/context
  -> define Rowan domain events and execution steps
  -> emit AgentEvent

logging
  -> consume AgentEvent
  -> write structured JSONL with Pino

cli
  -> compose Agent + Store + Logger
```

保留自有建模，因为这是 Agent runtime 的协议边界；移除自研 trace package，因为普通日志输出应该交给成熟 logger。

## 2. Design Decisions

### 2.1 `AgentEvent` 仍然属于 `agent`

`AgentEvent` 是 loop 对外暴露的领域事件，不是某个 logger 的格式。它继续由 `packages/agent` 定义：

```ts
type AgentEvent =
  | { type: "session_created"; session: SessionSnapshot; ts: string }
  | { type: "chat_start"; content: AgentMessage[]; ts: string }
  | { type: "message_delta"; delta: AgentMessage | AgentMessage[]; ts: string }
  | { type: "model_requested"; phase: LlmPhase; model: ModelRef; usage: ModelCallUsage; ts: string }
  | { type: "tool_start"; toolName: string; args: unknown; ts: string }
  | { type: "tool_end"; toolName: string; result: ToolResult; ts: string }
  | { type: "thread_created"; ... }
  | { type: "thread_end"; ... }
  | { type: "outcome"; outcome: Outcome; ts: string };
```

这些事件可以被 CLI、测试、UI、eval、workflow 或 logger 订阅。Pino 只是其中一个 sink。

### 2.2 `ExecutionTurn` 仍然属于 `store`

`ExecutionTurn` 是 phase 级执行历史，适合做 session sidecar / future DB / replay seed：

```ts
type ExecutionTurn = {
  id: string;
  sessionId: string;
  parentSessionId?: string;
  phase: "route" | "plan" | "execute" | "verify";
  requestedAtMs: number;
  completedAtMs: number;
  model: ModelRef;
  usage?: ModelCallUsage;
  scope: "conversation" | "execution" | "diagnostic";
  entries: ExecutionTurnEntry[];
};
```

日志不替代 `ExecutionTurn`。日志负责观察，store 负责可查询的 agent state。

### 2.3 `packages/trace` 下线

v0.3.5 移除：

```text
packages/trace
  src/jsonl-writer.ts
  src/jsonl-reader.ts
  src/inspect.ts
```

理由：

- reader / inspect 会把 logging 重新变成轻量数据库。
- v0.3.3 已经有 `AgentStore.steps`，更适合承接未来 replay / fork。
- 日志输出可以由 Pino 提供稳定 JSONL、redaction、destination 和 flush 能力。

### 2.4 新增 `packages/logging`

目标文件：

```text
packages/logging
  package.json
  src/index.ts
  src/redact.ts
  src/pino.ts
  test/pino-logger.test.ts
```

核心 API：

```ts
import type { AgentEvent, AgentEventListener } from "@rowan-agent/agent";

export type AgentEventLogPath = string | ((event: AgentEvent) => string | undefined);

export type AgentEventLoggerOptions = {
  mode?: "replace" | "append";
  level?: "debug" | "info" | "warn" | "error";
};

export type AgentEventLogger = AgentEventListener & {
  path(): string | undefined;
  flush(): Promise<void>;
};

export function pinoAgentEventLogger(
  path: AgentEventLogPath,
  options?: AgentEventLoggerOptions,
): AgentEventLogger;
```

输出格式是一行一个 Pino JSON record：

```json
{
  "level": 30,
  "time": 1760000000000,
  "pid": 12345,
  "hostname": "machine",
  "msg": "agent event",
  "eventType": "model_requested",
  "eventTs": "2026-05-03T141659-32+08:00",
  "sessionId": "ses_a6cca513",
  "phase": "route",
  "event": {
    "type": "model_requested",
    "phase": "route",
    "model": { "provider": "openai-compatible", "name": "Ling-2.6-1T" },
    "usage": { "inputMessages": 3 },
    "ts": "2026-05-03T141659-32+08:00"
  }
}
```

### 2.5 Redaction 留在 logging

旧 trace writer 的 secret redaction 移入 logging：

```ts
export function redactSecrets(value: unknown): unknown;
```

首批保留：

- `sk-*`
- `OPENAI_API_KEY=...`
- `ANTHROPIC_API_KEY=...`
- `GEMINI_API_KEY=...`

未来可以改用 Pino redaction path，但 v0.3.5 先保留现有 JSON payload 级 redaction，减少行为变化。

## 3. CLI Changes

### 3.1 Flag

移除：

```text
--trace <path>
```

新增：

```text
--log <path>
```

默认仍写：

```text
<workspace>/runs/<YYYY-MM-DDTHHMMSS-CC+HH:MM>-<session-id>.jsonl
```

但 CLI 输出改为：

```text
Log written to runs/2026-05-03T141657-32+08:00-ses_a6cca513.jsonl
```

### 3.2 Config

`rowan config` 输出：

```json
{
  "logging": {
    "automatic": true,
    "path": null
  }
}
```

不再输出 `trace` 字段。

### 3.3 Help

Help 文案改成 run log：

```text
Run logs:
  Session run logs are written automatically...
  Relative --log paths are resolved from <workspace>.
```

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
| `logging` | `agent` |
| `cli` | `adapters`, `agent`, `logging`, `session`, `store`, `workspace` |

`logging` 不依赖 `workspace`。默认路径解析仍由 CLI 完成。

## 5. Migration Steps

1. 新增 `packages/logging`，安装 `pino@10.3.1`。
2. 将 `redactSecrets()` 从 `trace` 迁入 `logging`。
3. 用 Pino destination 实现 `pinoAgentEventLogger()`。
4. CLI 从 `jsonlTraceWriter()` 改为 `pinoAgentEventLogger()`。
5. CLI `--trace` 改为 `--log`。
6. 删除 `packages/trace`。
7. 更新 package boundary test。
8. 更新 CLI 和 logging tests。
9. 更新 docs/roadmap 中的 trace terminology。

## 6. Not In v0.3.5

- 不实现 replay / fork。
- 不实现 log inspect CLI。
- 不引入 OpenTelemetry。
- 不把 `AgentEvent` 移入 logging。
- 不把 `ExecutionTurn` 改成 Pino log record。
- 不改 session persisted schema。

## 7. Acceptance Criteria

- `packages/logging` 存在，导出 Pino-backed AgentEvent logger。
- `packages/trace` 已移除。
- `package.json` workspace / package boundary test 不再引用 `trace`。
- CLI 默认写 run log，并打印 `Log written to ...`。
- CLI 支持 `--log <path>`。
- CLI 不再支持 `--trace <path>`。
- run log JSONL 每行是 Pino JSON record，且包含 `event` payload。
- log redaction 覆盖 API key 风险。
- `bun test packages` 通过。
- `bun run build` 通过。
