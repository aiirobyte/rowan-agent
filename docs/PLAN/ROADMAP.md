# Rowan Agent Roadmap

> 版本：v0.3.4
> 日期：2026-05-03
> 状态：v0.0.0 已定稿；v0.1.0 已实现真实模型运行时；v0.2.0 monorepo foundation 已实现；v0.3.0 route-first child-session predecessor 已实现；v0.3.1 persistent session 已实现；v0.3.2 thread/sub-session unification 已实现；v0.3.3 storage port 已实现；v0.3.4 store package consolidation planned
> 相关文档：`docs/PLAN/ARCHITECTURE.md`、`docs/PLAN/v0.0.0/PLAN.md`、`docs/PLAN/v0.1.0/PLAN.md`、`docs/PLAN/v0.2.0/PLAN.md`、`docs/PLAN/v0.3.0/PLAN.md`、`docs/PLAN/v0.3.1/PLAN.md`、`docs/PLAN/v0.3.2/PLAN.md`、`docs/PLAN/v0.3.3/PLAN.md`、`docs/PLAN/v0.3.4/PLAN.md`

## 1. 一句话定位

Rowan 是一个面向工程化 Agent 的 Harness Runtime，用来把任务规划、工具执行、验收标准、运行日志、可验证结果和后续评测能力标准化。

v0.0.0 不做完整平台。v0.0.0 只做最简 Agent 内核：

```text
Session
  -> Agent
  -> Task
  -> Tool calls
  -> Acceptance criteria verification
  -> Outcome
  -> Session log / JSONL trace
```

## 2. 已确定的 v0.0.0 决策

| 决策点 | v0.0.0 决策 |
|---|---|
| 技术栈 | TypeScript + Bun |
| 项目形态 | v0.0.0/v0.1.0 保持单包 `src/`；v0.2.0 开始 monorepo foundation |
| Agent 角色 | 同一个 Agent 同时承担 planner 和 executor |
| Task | v0.0.0 先只做 task，不做 sub-agent |
| Acceptance criteria | 结构化 schema |
| Verification | 同一个模型判断，后续再加 scorer |
| Session log / Message | 分离；log 是完整运行记录，messages 是模型上下文 |
| Skill | `SKILL.md` 可执行能力，类似 Codex skill |
| Trace | JSONL event subscriber |
| Policy | `beforeToolCall` / `afterToolCall` hook，完整 PolicyEngine 后置 |
| Schema | TypeBox 1.x + built-in `Schema.Compile()` validation |

## 3. v0.0.0 范围

v0.0.0 详细执行计划只维护在：

- `docs/PLAN/v0.0.0/README.md`
- `docs/PLAN/v0.0.0/PLAN.md`
- `docs/PLAN/v0.0.0/TASKS.md`

### 3.1 v0.0.0 必做

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

### 3.2 v0.0.0 不做

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

后续版本只保留方向，等 v0.0.0 完成后再展开详细执行计划。

| 版本 | 名称 | 目标 | 主要新增能力 |
|---|---|---|---|
| v0.0.0 | Minimal Agent Kernel | 跑通 task -> tool -> verify -> outcome | Agent、Task、Criteria、Tool、Skill、Trace、CLI |
| v0.1.0 | Real Model Runtime | 接入真实模型 | OpenAI-compatible `StreamFn`、Anthropic/Gemini 后续 |
| v0.2.0 | Monorepo + Workspace ACI Foundation | 完成拆包条件并启动模块化迁移 | packages/agent、adapters、trace、aci、cli，read/list/search tools |
| v0.3.0 | Agent Mechanism + Child Session | 优化 task 进入机制，并引入受控 child session | route phase、direct response、nested session、nested trace、per-session budget |
| v0.3.1 | Persistent Session + Multi-turn CLI | 支持跨 CLI 调用持续会话 | SessionStore、multi-turn Agent、`--session`、`sessions` commands、`chat` mode |
| v0.3.2 | Threaded Sub Agent Sessions | 让 sub-agent/sub-session 回到普通 Session + Agent 同构实现 | immutable input、task/goal Session metadata、thread route、thread_created/thread_end |
| v0.3.3 | Storage Port + Scoped Context | 升级存储边界，分离对话上下文与执行步骤历史 | AgentStore、JSON-backed store、ExecutionTurn、ContextScope、phase allowlists |
| v0.3.4 | Store Package Consolidation | 整理 v0.3.3 的 store 边界 | `packages/store`、AgentStore port、InMemoryAgentStore、LocalJsonAgentStore |
| v0.4.0 | Policy and Safety | 把 hook 升级成策略系统 | approval、permission、dangerous command guard |
| v0.5.0 | Trace Replay | 让失败 run 可复盘 | trace reader、replay、fork from step |
| v0.6.0 | Eval Harness | 系统比较 agent 质量 | dataset、scorer、batch report |
| v0.7.0 | Workflow | 外层编排 | graph executor、checkpoint、human approval |
| v1.0.0 | Modular Harness | 从单包演进为模块化 runtime | packages/agent、aci、trace、eval、workflow、cli |

## 5. v0.0.0 到 v1.0.0 的演进原则

1. v0.0.0 先把 Agent 内核做薄、做稳。
2. 任何后续能力必须通过 v0.0.0 的核心对象扩展：`Session`、`Task`、`Tool`、`Verifier`、`Outcome`、`AgentEvent`。
3. 不在 v0.0.0 引入 provider registry。先用 `StreamFn`，真实模型接入在 v0.1.0。
4. 不在 v0.0.0 引入 ToolRegistry。先用 `Tool[]`，工具生态在 v0.2.0 后扩展。
5. 不在 v0.0.0 引入 PolicyEngine。先用 hooks，策略系统在 v0.4.0。
6. 不在 v0.0.0 引入 eval。先让 task verification 成为内核能力，eval 在 v0.6.0。
7. 不在 v0.0.0 引入 child thread。先做单 task，child session 在 v0.3.0 作为当前 Agent 可控的新 session 能力引入。
8. 不在 v0.0.0 引入 workflow。workflow 必须是外层编排，不污染 Agent Loop。

## 6. 产品边界

### 6.1 目标用户

| 用户 | 需求 | Rowan 应提供 |
|---|---|---|
| Agent infra 开发者 | 想把 Agent 能力嵌入自己的系统 | 可嵌入 runtime、事件流、工具协议 |
| Coding agent 开发者 | 需要安全读写项目、运行测试、生成 diff | v0.2.0 Workspace ACI |
| AI 产品团队 | 需要比较模型、prompt、工具策略 | v0.5.0 Eval Harness |
| 企业工程团队 | 需要审计、回放、权限和可控执行 | v0.4.0 Policy + v0.5.0 Trace Replay |

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
8. 后续每个复杂能力都应从 v0.0.0 对象自然长出来。

## 8. 近期执行顺序

1. 建立 v0.3.4 store package consolidation 规划文档和任务表。
2. 新增 `packages/store`，承载 store port 和 JSON-backed store。
3. 将 `AgentStore` / `ExecutionTurn` 从 `agent` 移入 `store`。
4. 将 `LocalJsonAgentStore` 从 `cli` 移入 `store`。
5. 更新 package boundary test。
6. 跑完 v0.3.4 release checklist。

## 9. v0.1.0 范围

v0.1.0 详细执行计划维护在：

- `docs/PLAN/v0.1.0/README.md`
- `docs/PLAN/v0.1.0/PLAN.md`
- `docs/PLAN/v0.1.0/TASKS.md`

v0.1.0 已确定：

- 首个真实模型接 OpenAI-compatible Chat Completions。
- 通过 `StreamFn` 接入，不引入 provider registry。
- 用 `fetch`，不引入 OpenAI SDK。
- 默认 prompt-json 输出，native tool calling 后置。
- Anthropic/Gemini 后置。

## 10. v0.2.0 范围

v0.2.0 详细执行计划维护在：

- `docs/PLAN/v0.2.0/README.md`
- `docs/PLAN/v0.2.0/PLAN.md`
- `docs/PLAN/v0.2.0/TASKS.md`

v0.2.0 已确定：

- 以 monorepo foundation 作为主线。
- Workspace ACI 是触发拆包的第一批工具能力。
- `agent`、`adapters`、`trace`、`aci`、`cli` 进入首轮拆解。
- `eval` 和 `workflow` 只保留边界，不做完整实现。
- trace 在 v0.2.0 做 reader + inspect，完整 replay/fork 放到 v0.4.0。

v0.2.0 release gates：

- `bun test`
- `bun run build`
- `bun run rowan "hello"`
- `bun run rowan trace list`
- `bun run rowan trace show <run-id-or-file>`
- Trace reader can parse v0.1.0 JSONL files.
- Workspace ACI read-only tools pass path safety tests.
- Package dependency direction check passes.

## 11. v0.3.0 范围

v0.3.0 详细执行计划维护在：

- `docs/PLAN/v0.3.0/README.md`
- `docs/PLAN/v0.3.0/PLAN.md`
- `docs/PLAN/v0.3.0/TASKS.md`

v0.3.0 已确定：

- 当前输入先经过 `route` phase；直接回答不创建 task，需要执行时进入 `plan -> task_created -> execute -> verify`。
- 直接回答路径不创建 task，不执行工具。
- child session 作为当前 Agent 可控的新 session，而不是 workflow graph，也不是另一套 Agent 逻辑。
- child session 必须继承显式传入的 tools、skills、budget 和 trace parent id。
- v0.3.0 不做复杂多 agent 协商，不做长期 memory，不做 workflow DAG。

v0.3.0 release gates：

- `bun test`
- `bun run build`
- direct response trace 不包含 `task_created`
- tool request trace 在 `task_created` 前包含 `model_requested` route 事件
- child-session API 有单元测试覆盖 parent/child session 关系

## 12. v0.3.1 范围

v0.3.1 详细执行计划维护在：

- `docs/PLAN/v0.3.1/README.md`
- `docs/PLAN/v0.3.1/PLAN.md`
- `docs/PLAN/v0.3.1/TASKS.md`

v0.3.1 已确定：

- Session 需要从单次 run 内存对象升级为可持久化对象。
- 本地 Session 文件先保存在 `<workspace>/sessions/<session-id>.json`。
- `Agent.prompt()` 支持在同一个 Session 中多轮追加。
- CLI 支持 `--session <id>` 继续会话。
- CLI 支持 `sessions list/show/delete`。
- CLI 支持最小 `chat` 交互模式。
- 每轮仍然写独立 trace，但 trace 需要关联 session id。
- v0.3.1 不做长期 memory、自动摘要、RAG、trace replay 或 UI。

v0.3.1 release gates（已通过）：

- `bun test packages`
- `bun run build`
- `Agent.prompt()` 多轮测试通过
- CLI `--session` 续聊测试通过
- CLI `sessions list/show/delete` 测试通过
- CLI `chat` smoke test 通过
- trace inspector 能看到 session id

## 13. v0.3.2 范围

v0.3.2 详细执行计划维护在：

- `docs/PLAN/v0.3.2/README.md`
- `docs/PLAN/v0.3.2/PLAN.md`
- `docs/PLAN/v0.3.2/TASKS.md`

v0.3.2 已确定：

- Session schema 使用 `input` 替代旧初始输入字段。
- `input` 是 session 创建时的原始输入，多轮追加不会改写它。
- Session 增加 optional `task` 和 `goal`，用于 child thread 的结构化上下文。
- sub-agent/sub-session 不再是专门 loop，而是普通 Agent + 普通 Session 的 child thread。
- 主 Session 对工具、大规模任务和需要验证的请求走 `thread -> verify`。
- 新 trace 事件为 `thread_created` 和 `thread_end`。
- 旧 sub-session API 和旧 trace 事件名不保留兼容入口。

v0.3.2 release gates：

- `bun test packages`
- `bun run build`
- persisted Session JSON 不包含旧初始输入字段
- 多轮 prompt 不改写 `session.input`
- main Session 能自动创建 child thread 并验证 child outcome
- trace inspector 能识别 thread parent/child 关系

## 14. v0.3.3 范围

v0.3.3 详细执行计划维护在：

- `docs/PLAN/v0.3.3/README.md`
- `docs/PLAN/v0.3.3/PLAN.md`
- `docs/PLAN/v0.3.3/TASKS.md`

v0.3.3 已确定：

- 新增 `AgentStore` port，覆盖 session CRUD 和 step append/load。
- 先实现 JSON-backed store，不引入 DB。
- Session schema 升级到 v0.3.3，增加 step 存储。
- `session.messages` 收敛为用户可见对话上下文。
- route / plan / execute / verify 的内部输出进入 `ExecutionTurn`。
- prompt builder 按 phase 使用 scope allowlist。
- 旧 session schema 不自动迁移；v0.3.3 直接使用新 schema。

v0.3.3 release gates：

- `bun test packages`
- `bun run build`
- 新 session JSON 写入 v0.3.3 schema
- CLI 使用 JSON-backed `AgentStore`
- 多轮 route 不受 routing decision / phase prompt / failed outcome / unrelated tool result 污染
- old-schema session 给出明确 unsupported schema 错误

## 15. v0.3.4 范围

v0.3.4 详细执行计划维护在：

- `docs/PLAN/v0.3.4/README.md`
- `docs/PLAN/v0.3.4/PLAN.md`
- `docs/PLAN/v0.3.4/TASKS.md`

v0.3.4 已确定：

- 新增 `packages/store`。
- `AgentStore`、`ExecutionTurn`、`StepFilter`、`InMemoryAgentStore` 移入 `store`。
- JSON-backed `LocalJsonAgentStore` 也放入 `store`，不另建 `store-json`。
- `session` 保持纯数据模型，不合并 store 实现。
- `store` 不依赖 `agent`，避免循环。
- v0.3.3 persisted JSON schema 保持不变。

v0.3.4 release gates：

- `bun test packages`
- `bun run build`
- package boundary test 覆盖 `store`
- CLI 继续可创建、加载、列出 session

## 16. Open Questions

这些问题不阻塞 v0.3.4，但会影响 v0.4.0+：

- v0.4.0 policy approval 是 CLI 交互优先，还是配置文件优先？
- v0.5.0 replay 是否需要 workspace snapshot？
- v0.6.0 scorer 是否优先程序化 scorer，而不是 LLM judge？
