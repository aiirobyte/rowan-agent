# Rowan Agent Roadmap

> 版本：0.3  
> 日期：2026-05-01  
> 状态：v0 已定稿；v0.1 已实现真实模型运行时，待真实 API 手动验收  
> 相关文档：`docs/ARCHITECTURE.md`、`docs/v0/PLAN.md`、`docs/v0.1/PLAN.md`、`docs/AGENT_COMPETITIVE_ANALYSIS.md`

## 1. 一句话定位

Rowan 是一个面向工程化 Agent 的 Harness Runtime，用来把任务规划、工具执行、验收标准、运行日志、可验证结果和后续评测能力标准化。

v0 不做完整平台。v0 只做最简 Agent 内核：

```text
Session
  -> Agent
  -> Task
  -> Tool calls
  -> Acceptance criteria verification
  -> Outcome
  -> Session log / JSONL trace
```

## 2. 已确定的 v0 决策

| 决策点 | v0 决策 |
|---|---|
| 技术栈 | TypeScript + Bun |
| 项目形态 | 单包 `src/`，暂不做 monorepo |
| Agent 角色 | 同一个 Agent 同时承担 planner 和 executor |
| Task | v0 先只做 task，不做 sub-agent |
| Acceptance criteria | 结构化 schema |
| Verification | 同一个模型判断，后续再加 scorer |
| Session log / Message | 分离；log 是完整运行记录，messages 是模型上下文 |
| Skill | `SKILL.md` 可执行能力，类似 Codex skill |
| Trace | JSONL event subscriber |
| Policy | `beforeToolCall` / `afterToolCall` hook，完整 PolicyEngine 后置 |
| Schema | TypeBox 1.x + built-in `Schema.Compile()` validation |

## 3. v0 范围

v0 详细执行计划只维护在：

- `docs/v0/README.md`
- `docs/v0/PLAN.md`
- `docs/v0/TASKS.md`

### 3.1 v0 必做

- TypeScript + Bun 单包项目。
- Stateful `Agent` class。
- Low-level `runAgentLoop()`。
- `Session`，并分离 `messages` 与 `log`。
- 结构化 `Task`。
- 结构化 `AcceptanceCriterion`。
- demo `Tool` 和 tool args validation。
- `beforeToolCall` / `afterToolCall` hooks。
- 同模型 verifier。
- `Outcome`。
- `SKILL.md` loader。
- JSONL trace subscriber。
- 最小 CLI。
- Bun test 覆盖核心 loop。

### 3.2 v0 不做

- real model adapter。
- workspace ACI。
- shell/network/file write tools。
- eval runner。
- replay/fork。
- full policy engine。
- sub-agent。
- workflow graph。
- MCP。
- Web UI。
- monorepo 拆包。

## 4. 后续版本总览

后续版本只保留方向，等 v0 完成后再展开详细执行计划。

| 版本 | 名称 | 目标 | 主要新增能力 |
|---|---|---|---|
| v0 | Minimal Agent Kernel | 跑通 task -> tool -> verify -> outcome | Agent、Task、Criteria、Tool、Skill、Trace、CLI |
| v0.1 | Real Model Runtime | 接入真实模型 | OpenAI-compatible `StreamFn`、Anthropic/Gemini 后续 |
| v0.2 | Workspace ACI | 面向 coding/workspace agent | read/list/search/diff/patch/test tools |
| v0.3 | Policy and Safety | 把 hook 升级成策略系统 | approval、permission、dangerous command guard |
| v0.4 | Trace Replay | 让失败 run 可复盘 | trace reader、replay、fork from step |
| v0.5 | Eval Harness | 系统比较 agent 质量 | dataset、scorer、batch report |
| v0.6 | Subagent as Tool | 受控多 Agent | child run、nested trace、per-subagent budget |
| v0.7 | Workflow | 外层编排 | graph executor、checkpoint、human approval |
| v1.0 | Modular Harness | 从单包演进为模块化 runtime | packages/core、aci、trace、eval、workflow、cli |

## 5. v0 到 v1 的演进原则

1. v0 先把 Agent 内核做薄、做稳。
2. 任何后续能力必须通过 v0 的核心对象扩展：`Session`、`Task`、`Tool`、`Verifier`、`Outcome`、`AgentEvent`。
3. 不在 v0 引入 provider registry。先用 `StreamFn`，真实模型接入在 v0.1。
4. 不在 v0 引入 ToolRegistry。先用 `Tool[]`，工具生态在 v0.2 后扩展。
5. 不在 v0 引入 PolicyEngine。先用 hooks，策略系统在 v0.3。
6. 不在 v0 引入 eval。先让 task verification 成为内核能力，eval 在 v0.5。
7. 不在 v0 引入 sub-agent。先做单 task，sub-agent 后续作为 tool。
8. 不在 v0 引入 workflow。workflow 必须是外层编排，不污染 Agent Loop。

## 6. 产品边界

### 6.1 目标用户

| 用户 | 需求 | Rowan 应提供 |
|---|---|---|
| Agent infra 开发者 | 想把 Agent 能力嵌入自己的系统 | 可嵌入 runtime、事件流、工具协议 |
| Coding agent 开发者 | 需要安全读写项目、运行测试、生成 diff | v0.2 Workspace ACI |
| AI 产品团队 | 需要比较模型、prompt、工具策略 | v0.5 Eval Harness |
| 企业工程团队 | 需要审计、回放、权限和可控执行 | v0.3 Policy + v0.4 Trace Replay |

### 6.2 暂不优先

- 不优先做 no-code app builder。
- 不优先做完整 IDE。
- 不优先做企业级 control plane。
- 不优先做复杂多 Agent 社会模拟。
- 不优先做重型 RAG 平台。

## 7. 架构原则

1. Agent Loop 要小，接近 pi-agent 的核心风格。
2. Task 和 acceptance criteria 是 Rowan 的中心抽象。
3. Session log 和 model messages 必须分离。
4. Skill 是可执行能力，以 `SKILL.md` 表达。
5. Trace 是 event subscriber，不先做平台服务。
6. Tool 调用必须 schema validate。
7. Verification 先内置，同模型判断；scorer 后续外接。
8. 后续每个复杂能力都应从 v0 对象自然长出来。

## 8. 近期执行顺序

1. 按 `docs/v0/PLAN.md` 完成 M0-M3。
2. 跑通 fake stream 下的 task -> tool -> verification -> outcome。
3. 实现 stateful `Agent` class。
4. 实现 `SKILL.md` loader。
5. 实现 JSONL trace subscriber。
6. 实现最小 CLI。
7. 跑完 v0 release checklist。

## 9. v0.1 范围

v0.1 详细执行计划维护在：

- `docs/v0.1/README.md`
- `docs/v0.1/PLAN.md`
- `docs/v0.1/TASKS.md`

v0.1 已确定：

- 首个真实模型接 OpenAI-compatible Chat Completions。
- 通过 `StreamFn` 接入，不引入 provider registry。
- 用 `fetch`，不引入 OpenAI SDK。
- 默认 prompt-json 输出，native tool calling 后置。
- Anthropic/Gemini 后置。

## 10. Open Questions

这些问题不阻塞 v0.1，但会影响 v0.2+：

- v0.2 Workspace ACI 是否以 coding agent 为唯一目标？
- v0.3 policy approval 是 CLI 交互优先，还是配置文件优先？
- v0.4 replay 是否需要 workspace snapshot？
- v0.5 scorer 是否优先程序化 scorer，而不是 LLM judge？
