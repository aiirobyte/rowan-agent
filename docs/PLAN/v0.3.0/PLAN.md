# Rowan v0.3.0 Plan

> 版本：v0.3.0
> 日期：2026-05-01
> 状态：规划与首批机制修正中
> 基线：v0.2.0 Monorepo + Workspace ACI Foundation
> 任务表：`docs/PLAN/v0.3.0/TASKS.md`

## 1. v0.3.0 目标

v0.3.0 的目标是优化 Rowan 的 Agent 机制，并引入最小可控 sub Agent。

上一版的 loop 会把所有输入都规划成 task：

```text
plan -> task_created -> execute -> verify
```

这对简单问答、格式化输出和轻量说明过重。v0.3.0 改为：

```text
route
  -> needsTask=false: direct response outcome
  -> needsTask=true: plan -> task_created -> execute -> verify
```

## 2. Route-first Task Gating

新增 `route` phase：

```json
{
  "message": "string",
  "needsTask": true
}
```

判定规则：

- 需要工具、workspace、命令执行、文件修改、多步骤执行、skill 执行或验收时，`needsTask=true`。
- 直接回答即可满足用户时，`needsTask=false`。
- `needsTask=false` 不创建 task，不执行工具，不进入 verifier。
- `needsTask=true` 保持原 task 流程。
- 显式工具请求的确定性兜底属于 `packages/agent` 调度层；adapter 只保留模型返回，不注入业务流程判断。

Prompt 与上下文组装由新的 `@rowan-agent/context` 模块管理。当前它负责 prompt assembly，后续数据库、长期上下文和检索接入也从这里扩展，避免把业务调度规则散落到模型请求层。

Trace 规则：

- direct response 必须包含 route `model_call` 和 `outcome`。
- direct response 不能包含 `task_created`。
- task run 必须先有 route `model_call`，再有 `task_created`。

## 3. Sub Agent

v0.3.0 的 sub Agent 是父 Agent 发起的 child run，不是 workflow graph。

最小 API 方向：

```ts
type SubAgentInput = {
  parentSessionId: string;
  prompt: string;
  tools: Tool[];
  skills?: Skill[];
  maxAttempts?: number;
  budget?: {
    maxToolCalls?: number;
    maxModelCalls?: number;
  };
};
```

子运行要求：

- 显式继承 tools 和 skills，不隐式共享全部父能力。
- trace 记录 parent/child 关系。
- 子 Agent 的 outcome 回到父 Agent 作为 tool-like evidence。
- budget 超限必须以结构化失败返回。

## 4. 不做

- 不做多 Agent 自治协商。
- 不做长期 memory。
- 不做 workflow DAG。
- 不做跨进程 worker pool。
- 不做 UI。
- 不把 sub Agent 默认暴露给所有 tool。
- 不在模型 adapter 层实现 task 调度策略。

## 5. 验收标准

- `package.json` 与 workspace packages 使用 `0.3.0`。
- 文档版本号使用 `v0.3.0` 形式，历史版本使用三段式。
- direct response path 有测试覆盖。
- tool request path 有 route-before-task 测试覆盖。
- sub Agent 最小 API 和 trace parent/child 关系有测试覆盖。
- `bun test` 和 `bun run build` 通过。
