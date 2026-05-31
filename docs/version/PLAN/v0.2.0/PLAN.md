# Rowan v0.2.0 Plan

> 版本：v0.2.0
> 日期：2026-05-01
> 状态：implemented
> 技术栈：TypeScript + Bun
> 基线：v0.1.0 Real Model Runtime
> 任务表：`docs/PLAN/v0.2.0/TASKS.md`

## 1. v0.2.0 目标

v0.2.0 的核心目标是完成 monorepo 拆包条件，并开始按照 `docs/PLAN/ARCHITECTURE.md` 的模块定义拆解。

v0.2.0 不是完整 v1.0.0。它只做最小、可回归、低风险的拆包：

```text
packages/
  agent/       Agent, Session, Task, Tool, Verifier, Events
  adapters/   OpenAI-compatible real model adapter
  trace/      JSONL writer, reader, basic inspect
  workspace/   workspace read/list/search/diff/patch/test tools
  cli/        command interface and runtime composition
```

`packages/eval` 和 `packages/workflow` 在 v0.2.0 只定义未来边界，不进入主执行链路。

## 2. 为什么 v0.2.0 开始拆包

`docs/PLAN/ARCHITECTURE.md` 中定义了拆包条件：

| 条件 | 当前状态 | v0.2.0 处理方式 |
|---|---|---|
| v0.0.0 API 稳定 | 基本稳定，但需要显式冻结 public API | 建立 `agent` public exports，迁移 import 到 package 入口 |
| 至少一个真实模型 adapter 完成 | OpenAI-compatible 已实现 | 迁入 `packages/adapters` |
| workspace tools 开始引入多工具 | 尚未开始 | 新增 `packages/workspace` 最小工具集 |
| trace 不再只是 writer，需要 reader/replay | writer 已有，reader/replay 未有 | v0.2.0 做 reader + inspect，replay/fork 后置 |

因此 v0.2.0 的正确定位是：

```text
Monorepo Split Readiness
  + First Package Extraction
  + Workspace Tooling Seed
```

## 3. 范围

### 3.1 必做

- Root workspace 基础：
  - `package.json` 增加 `workspaces`。
  - 根目录保留 `bun run rowan`、`bun test`、`bun run build`。
  - 建立 package-level `package.json` 和 `src/index.ts`。
- `packages/agent`：
  - 迁移核心类型和运行时。
  - 导出稳定 public API。
  - 不依赖任何其他 Rowan package。
- `packages/adapters`：
  - 迁移 OpenAI-compatible runtime。
  - 只依赖 `agent` 的 public types。
  - 保持 `.env` / CLI config 行为。
- `packages/trace`：
  - 迁移 JSONL writer。
  - 新增 JSONL reader。
  - 新增 basic inspect API：list runs、read events、filter by type/run/session。
- `packages/workspace`：
  - 新增 Workspace tools 最小多工具集合。
  - 以 `Tool` 协议暴露，不污染 Agent Loop。
  - 默认只允许 workspace 内操作。
- `packages/cli`：
  - CLI 组合 agent、adapters、trace、workspace。
  - 保持当前命令兼容。
  - 新增 trace 子命令。
- 测试：
  - 原有测试迁移后继续通过。
  - 每个 package 至少有边界测试。
  - 增加 package dependency direction 检查。

### 3.2 不做

- 不做完整 provider registry。
- 不做 Anthropic/Gemini native adapter。
- 不做完整 replay/fork from step。
- 不做 eval runner。
- 不做 workflow graph executor。
- 不做 thread runner。
- 不做 Web UI。
- 不做远程 sandbox 或容器执行。

## 4. 目标目录

v0.2.0 目标结构：

```text
package.json
tsconfig.json
tsconfig.base.json

packages/
  agent/
    package.json
    src/
      index.ts
      agent.ts
      agent-loop.ts
      session.ts
      task.ts
      tools.ts
      types.ts
      verifier.ts

  adapters/
    package.json
    src/
      index.ts
      openai-compatible.ts
      prompt-builder.ts
      json-extract.ts

  trace/
    package.json
    src/
      index.ts
      jsonl-writer.ts
      jsonl-reader.ts
      inspect.ts

  workspace/
    package.json
    src/
      index.ts
      workspace.ts
      tools/
        list.ts
        read.ts
        search.ts
        diff.ts
        patch.ts
        test.ts

  cli/
    package.json
    src/
      index.ts
      cli.ts
      commands/
        run.ts
        trace.ts
```

后续 v1.0.0 再补：

```text
packages/eval/
packages/workflow/
```

## 5. Package 边界

### 5.1 `packages/agent`

职责：

- 定义 Agent Harness 的最小内核。
- 管理 `Session`、`Task`、`Tool`、`AcceptanceCriterion`、`Outcome`。
- 定义 `AgentEvent` 和事件订阅接口。
- 执行 agent loop。

禁止：

- 读取 `.env`。
- 发起网络请求。
- 读写 trace 文件。
- 直接访问 workspace 文件系统。
- 依赖 `adapters`、`trace`、`workspace`、`cli`。

### 5.2 `packages/adapters`

职责：

- 提供真实模型 runtime。
- 把 provider response 映射为 `agent` 的 `StreamFn` events。
- 管理 provider-specific prompt contract。

v0.2.0 只包含：

- OpenAI-compatible Chat Completions。

禁止：

- 直接写 trace。
- 执行 tools。
- 读取 workspace 文件。

### 5.3 `packages/trace`

职责：

- 写入 `AgentEvent` JSONL。
- 读取历史 run。
- 提供 basic inspect API。

v0.2.0 只做：

- `createJsonlTraceWriter()`。
- `readTraceFile()`。
- `listTraceRuns()`。
- `filterTraceEvents()`。

后置：

- replay。
- fork from step。
- trace compaction。

### 5.4 `packages/workspace`

职责：

- 把 workspace 能力封装为 `Tool`。
- 统一 workspace root、路径校验、读写权限。
- 为 coding/workspace agent 提供最小能力。

v0.2.0 工具：

| Tool | 能力 | 默认权限 |
|---|---|---|
| `workspace.list` | 列目录 / 文件 | read |
| `workspace.read` | 读取文件 | read |
| `workspace.search` | 搜索文本 | read |
| `workspace.diff` | 生成 diff 预览 | read |
| `workspace.patch` | 应用 patch | write |
| `workspace.bash` | 运行 bash 命令 | execute |

写入和执行类工具必须经过 policy hook。

### 5.5 `packages/cli`

职责：

- 解析命令行参数。
- 解析模型 config。
- 组合 agent/adapters/trace/workspace。
- 管理用户可见错误。

v0.2.0 命令：

```bash
bun run rowan "task"
bun run rowan --trace .rowan/runs/custom.jsonl "task"
bun run rowan trace list
bun run rowan trace show <run-id-or-file>
```

## 6. Public API 稳定策略

v0.2.0 需要显式冻结一层 public API，并以 package 入口作为唯一稳定入口：

```ts
export {
  Agent,
  runAgentLoop,
  createSession,
  createTask,
  verifyOutcome,
};

export type {
  AgentEvent,
  AgentMessage,
  AgentOutcome,
  AcceptanceCriterion,
  Session,
  Task,
  Tool,
  ToolCall,
  ToolResult,
  StreamFn,
};
```

v0.2.0 不保留根 `src/index.ts` 兼容导出。原因是当前项目还没有对外发布 npm package，也没有需要承诺的旧 import surface；保留旧入口会让后续边界变模糊。

迁移规则：

- 测试和内部代码改为从 package 入口导入。
- 根 `src/` 在 CLI 迁入 `packages/cli` 后删除。
- 根 `package.json` 只保留 scripts、workspace 配置和共享依赖。
- 用户可见兼容只保留命令层：`bun run rowan "task"` 继续可用。

## 7. Trace Schema 策略

v0.2.0 不修改现有事件语义。

保留：

- `session_created` 不包含 messages、createdAt、updatedAt、messageCount。
- `chat_start.content` 是初始 `AgentMessage[]`。
- `message_delta.delta` 是新增 `AgentMessage`。
- `message_delta.content` 是追加后的完整 `AgentMessage[]`。
- `chat_end.content` 是最终完整 `AgentMessage[]`。
- `model_requested` 合并 request/response，只记录 token usage 和 `inputMessages`。
- 顶层时间字段为 `ts`。

可新增：

- trace reader 内部 schema version 常量。
- inspect API 的返回类型。

不新增：

- replay event。
- fork event。
- raw prompt / raw response 记录。

## 8. Workspace tools 设计

v0.2.0 的 Workspace tools 目标是提供工具协议，不是做完整 coding agent。

核心对象：

```ts
interface WorkspaceContext {
  root: string;
  allowWrite?: boolean;
  allowExecute?: boolean;
}

function createWorkspaceTools(context: WorkspaceContext): Tool[];
```

路径规则：

- 所有路径必须 resolve 到 `root` 内部。
- 默认忽略 `.git`、`node_modules`、`.rowan/runs`。
- 读取结果需要限制最大字符数。
- patch 写入默认走 policy hook。
- execute 命令通过 policy hook 进入用户/策略许可路径。

v0.2.0 初始建议：

```ts
const tools = [
  createWorkspaceListTool(context),
  createWorkspaceReadTool(context),
  createWorkspaceSearchTool(context),
];
```

`workspace.patch` 和 `workspace.bash` 可以在 M4 后半段接入，确保 policy hook 先可用。

## 9. 迁移顺序

### M0: API Freeze and Docs

目标：

- 明确 public API。
- 明确 package dependency direction。
- 建立 v0.2.0 任务表。

验收：

- `docs/PLAN/v0.2.0/PLAN.md` 完成。
- `docs/PLAN/v0.2.0/TASKS.md` 完成。
- `docs/PLAN/ROADMAP.md` 和 `docs/PLAN/ARCHITECTURE.md` 已同步。

### M1: Workspace Scaffold

目标：

- 建立 Bun workspace。
- 创建 package 目录。
- 保持根命令可用。

验收：

- `bun install` 不破坏 lockfile。
- `bun test` 仍通过。
- `bun run build` 仍通过。

### M2: Extract Core

目标：

- 将 Agent 内核迁入 `packages/agent`。
- 更新测试和内部 import，直接使用 `packages/agent` 入口。
- 不保留根 `src/index.ts` 兼容导出。

验收：

- agent tests 通过。
- `agent` 无任何 Rowan package dependency。
- CLI 行为不变。

### M3: Extract Adapters and Trace

目标：

- 将 OpenAI-compatible adapter 迁入 `packages/adapters`。
- 将 JSONL trace writer 迁入 `packages/trace`。
- 新增 trace reader。

验收：

- mock provider tests 通过。
- trace writer tests 通过。
- reader 能读取现有 `.rowan/runs/*.jsonl`。

### M4: Add Workspace tools

目标：

- 新增 `packages/workspace`。
- 实现 read-only tools。
- 接入 CLI 默认工具集。

验收：

- `workspace.list`、`workspace.read`、`workspace.search` tests 通过。
- agent 可以通过工具读取项目文件。
- 路径逃逸测试通过。

### M5: Extract CLI

目标：

- 将 CLI runtime composition 迁入 `packages/cli`。
- 根 `bun run rowan` 指向新 CLI。
- 新增 trace 子命令。

验收：

- `bun run rowan "hello"` 行为不变。
- `bun run rowan trace list` 可列出 runs。
- `bun run rowan trace show <run-id-or-file>` 可查看事件摘要。

### M6: Release Hardening

目标：

- 补齐 package boundary tests。
- 清理旧 `src/` 和旧路径 import。
- 更新 README。

验收：

- `bun test`
- `bun run build`
- `bun run rowan "hello"`
- 无反向 package dependency。
- trace schema 与 v0.1.0 兼容。

## 10. 风险和约束

| 风险 | 影响 | 缓解 |
|---|---|---|
| 过早拆太细 | package 边界反复变化 | v0.2.0 只拆已有压力的 agent/adapters/trace/workspace/cli |
| 循环依赖 | build 和测试不稳定 | 明确 dependency direction，并加检查 |
| CLI 兼容破坏 | 用户现有命令失效 | 根 scripts 保持不变 |
| Trace schema 漂移 | 历史 run 不可读 | v0.2.0 不改事件语义 |
| Workspace tools 写入过早 | 安全边界不清 | 先 read-only，再 patch/test |
| Bun workspace 配置复杂 | 开发体验下降 | root scripts 继续作为唯一入口 |

## 11. Release Checklist

- [x] `bun test`
- [x] `bun run build`
- [x] `bun run rowan "hello"`
- [x] `bun run rowan trace list`
- [x] `bun run rowan trace show <run-id-or-file>`
- [x] OpenAI-compatible mock tests pass after package extraction
- [x] Trace reader can parse v0.1.0 JSONL files
- [x] Workspace read-only tools pass tests
- [x] Package dependency direction check passes
- [x] README / ROADMAP / ARCHITECTURE updated
