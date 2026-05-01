# Agent Harness Competitive Analysis

> 截至日期：2026-04-29
> 目标：参考 pi-agent-core 与 yoagent，梳理主流 Agent / Agent Harness 的实现方式、能力边界、竞品差异，并提炼 Rowan Agent Harness 的产品与架构机会。

## 1. 结论摘要

如果 Rowan 要做“类似 pi-agent-core / yoagent 的 Agent Harness”，最值得切入的不是再做一个通用多智能体框架，而是做一个 **小核心、强运行时、可观测、可回放、可评测、可嵌入** 的 Agent Harness。

当前市场可以粗分为四层：

1. **极简 Agent Loop / Harness 内核**：pi-agent-core、yoagent。核心价值是事件流、工具执行、状态、转向、取消、follow-up 队列，适合做 Rowan 的内核参考。
2. **通用 Agent 框架 / SDK**：OpenAI Agents SDK、Claude Agent SDK、LangGraph、Microsoft Agent Framework、CrewAI、LlamaIndex、Pydantic AI、Mastra、Agno、Letta、Haystack、smolagents。它们覆盖工具、工作流、多智能体、记忆、结构化输出、可观测性。
3. **编码 Agent / 软件工程 Agent 产品**：Codex、Claude Code、Gemini CLI、Goose、OpenHands、SWE-agent、GitHub Copilot coding agent、Cursor Background Agents、Windsurf Cascade、Devin、Replit Agent。它们把 harness 做进了终端、IDE、云沙箱、GitHub PR 和后台任务流里。
4. **企业自动化 / Agent 运维平台**：Harness Agents、Rebyte Agent Harness、Open Harness 等。它们更强调治理、权限、审计、模型路由、BYOK、pipeline-native 或统一 API。

Rowan 最好的机会位在：

```text
pi-agent-core/yoagent 的极简事件驱动内核
  +
SWE-agent/OpenHands 的 Agent-Computer Interface 与沙箱经验
  +
LangGraph/Mastra/OpenAI Agents SDK 的 tracing/eval/guardrail 能力
  +
Goose/Claude Code/Codex 的本地工具权限与开发者工作流
```

## 2. 参考基线：pi-agent-core 与 yoagent

| 项目 | 定位 | 实现方式 | 核心功能 | 对 Rowan 的启示 |
|---|---|---|---|---|
| pi-agent-core | Python 极简 stateful agent loop | 用户提供 `StreamFn`；核心 loop 负责 prompt -> stream -> tool -> steering/follow-up；Pydantic 类型 | LLM-agnostic、事件流、JSON Schema 工具、steering、follow-up、取消、SSE proxy transport、agent/LLM 两级事件 | 非常适合作为最小可行内核：不要一开始绑定 provider，也不要把 workflow/RAG/反思塞进核心 |
| yoagent | Rust 版极简 agent loop，受 pi-agent-core 启发 | Rust Agent struct + builder；模型流式输出、工具执行、事件流、上下文压缩 | 多 provider、AgentEvent streaming、内置编码工具、token 估算与分层压缩、turn/token/time limit、取消、steering/follow-up、子 agent | Rowan 如果追求性能与可嵌入，可以学习其“loop is the product”：小循环、强事件、强边界 |

资料：pi-agent-core PyPI 描述了它的 LLM-agnostic `StreamFn`、事件系统、工具执行、steering/follow-up、proxy transport 和模块结构；yoagent 文档明确强调 “the loop is the product”，并列出 streaming events、多 provider、工具系统、上下文管理、执行限制、steering/follow-up、取消等能力。
来源：[pi-agent-core PyPI](https://pypi.org/project/pi-agent-core/)、[yoagent docs](https://yologdev.github.io/yoagent/)、[yoagent docs.rs](https://docs.rs/crate/yoagent/0.5.1)

## 3. 市场分层

### 3.1 极简 Loop / Harness 内核

这一层的共同点是：不试图定义完整产品，只负责把模型、消息、工具、状态和事件串起来。

| 项目 | 语言/形态 | Agent Loop | 工具 | 状态/上下文 | 观测 | 优势 | 短板 |
|---|---|---|---|---|---|---|---|
| pi-agent-core | Python package | 异步生成器 loop；bring-your-own stream | JSON Schema + async execute | Agent state、queue、context | Agent events + assistant stream events | 最小、清晰、容易嵌入 | provider、sandbox、workflow、eval 都要自己补 |
| yoagent | Rust crate | prompt -> LLM stream -> tool execution -> repeat | `AgentTool` trait；内置 bash、file、search | token 估算、自动压缩、turn/time/token limit | `AgentEvent` stream | 高性能、工程边界清楚、多 provider | 更偏底层库，生态与上层产品能力有限 |

### 3.2 通用 Agent 框架 / SDK

| 项目 | 定位 | 实现方式 | 主要功能 | 强项 | 弱点/Rowan 可避开 |
|---|---|---|---|---|---|
| OpenAI Agents SDK | OpenAI 官方 agent SDK | Agent = instructions + tools + handoffs + guardrails + structured output；Runner 执行 | 工具调用、handoffs、guardrails、tracing、流式、context、MCP/hosted tools | 官方模型集成、tracing 默认开启、guardrail 语义清楚 | OpenAI 生态绑定较强；不是通用本地 harness |
| Claude Agent SDK / Claude Code SDK | Claude Code 底层 harness SDK | 基于 Claude Code harness；TS/Python/headless | 自动上下文压缩、文件/代码执行/web/MCP、权限、session、monitoring、hooks、commands、skills | 真实编码 agent 的产品化 harness 经验 | 强 Claude 绑定；很多能力是产品/订阅形态 |
| LangGraph | 状态图 / durable workflow | Graph nodes + state + checkpoint | durable execution、human-in-loop、长任务恢复、工作流控制 | 强状态机、可恢复、适合复杂 agentic workflow | 相对重；核心 loop 不够“薄” |
| Microsoft Agent Framework | AutoGen + Semantic Kernel 后继 | agent abstraction + graph workflow + enterprise middleware | session state、type safety、middleware、telemetry、多 provider、workflow、A2A/AG-UI/Azure/M365 | 企业栈、类型与遥测、长任务和 human-in-loop | public preview；微软生态感较强 |
| CrewAI | 多 agent crew + flow | Crews 负责自治协作，Flows 负责事件驱动控制 | agents、tasks、processes、memory、knowledge、guardrails、callbacks、human-in-loop、enterprise console | 多角色协作易上手，业务自动化样板多 | 抽象偏高，可能掩盖底层 loop 和 trace 细节 |
| LlamaIndex Agents / Workflows | RAG 强项 + AgentWorkflow | Workflow event system 驱动 agent | FunctionAgent、AgentWorkflow、RAG、human-in-loop、事件流 | 知识库/RAG 场景强 | 通用 harness 的工具权限、沙箱、回放不是核心卖点 |
| Pydantic AI | 类型安全 Python agent | Pydantic schema + Agent run/stream/iter | 结构化输出、工具、usage、stream events、graph iteration | schema validation 与 Python DX 强 | 工作流/多 agent/沙箱需要外接 |
| Mastra | TypeScript agent/workflow 平台 | Agents + Tools + Workflows + Storage + OTel | memory、MCP、workflow、networks、guardrails、HITL、observability、scorers/evals | TypeScript-first，生产部署、观测和评测完整 | 生态重，Rowan 不必复制全栈平台 |
| Agno | Agentic software runtime | SDK + AgentOS + control plane | FastAPI backend、50+ endpoints、sessions、memory、knowledge、tracing、scheduling、RBAC、human approval | “把 agent 变成服务”的产品化能力强 | 平台化重；核心 loop 不一定透明 |
| Letta | Stateful agents / memory-first | DB 持久化 agent state；memory blocks + recall/archival memory | 持久记忆、自编辑 memory、ADE、REST/SDK、MemFS、coding agent | 长期记忆与 agent state 可视化非常强 | 更偏 memory platform，不是通用工具 sandbox harness |
| Haystack | 生产级 AI orchestration / RAG | Pipeline components + Agent component loop | components、pipelines、Tool/ComponentTool/ToolInvoker、Agent state schema、streaming、serialization | RAG/管线/生产部署强 | agent loop 是组件之一，不是 harness-first |
| smolagents | 轻量 Python code agent | MultiStepAgent；CodeAgent 写 Python actions；ToolCallingAgent 写 JSON | code actions、sandbox via Docker/E2B/Modal/Blaxel、managed agents、callbacks | 简洁、code action 表达力强 | 产品化 trace、权限、workflow 较少 |
| Youtu-Agent | 开源模型友好的 agent 框架 | workflow mode + meta-agent mode；含评测/训练 | data analysis、file processing、deep research、自动 agent 生成、experience learning、RL | 面向开源模型、高 benchmark 表现 | 更偏研究/框架，不是极简 harness |

资料来源：
[OpenAI Agents SDK](https://platform.openai.com/docs/guides/agents-sdk/)、[OpenAI Agents SDK tracing](https://openai.github.io/openai-agents-python/tracing/)、[OpenAI Agents SDK guardrails](https://openai.github.io/openai-agents-python/guardrails/)、[OpenAI Agents SDK handoffs](https://openai.github.io/openai-agents-python/handoffs/)
[Claude Agent SDK](https://docs.claude.com/en/docs/claude-code/sdk/sdk-overview)、[Claude Code overview](https://code.claude.com/docs/en/overview)、[Claude Code MCP](https://docs.anthropic.com/en/docs/claude-code/mcp)
[LangGraph durable execution](https://docs.langchain.com/oss/python/langgraph/durable-execution)
[Microsoft Agent Framework](https://learn.microsoft.com/en-us/agent-framework/overview/)
[CrewAI introduction](https://docs.crewai.com/en/introduction)、[CrewAI Flows](https://docs.crewai.com/en/concepts/flows)
[LlamaIndex human-in-the-loop](https://docs.llamaindex.ai/en/stable/understanding/agent/human_in_the_loop/)
[Pydantic AI agents](https://pydantic.dev/docs/ai/core-concepts/agent/)、[Pydantic AI output](https://pydantic.dev/docs/ai/core-concepts/output/)
[Mastra agents](https://mastra.ai/agents)、[Mastra observability](https://mastra.ai/observability)
[Agno docs](https://docs.agno.com/)、[Agno memory](https://docs-v1.agno.com/agents/memory)
[Letta stateful agents](https://docs.letta.com/guides/core-concepts/stateful-agents/)、[Letta memory architecture](https://docs.letta.com/guides/agents/architectures/memgpt)
[Haystack Agent](https://docs.haystack.deepset.ai/docs/agent)、[Haystack overview](https://docs.haystack.deepset.ai/docs)
[smolagents](https://huggingface.co/docs/smolagents/index)、[smolagents agents reference](https://huggingface.co/docs/smolagents/main/reference/agents)
[Youtu-Agent GitHub](https://github.com/Tencent/Youtu-agent)

### 3.3 编码 Agent / 软件工程 Agent

| 项目 | 定位 | 实现方式 | 主要功能 | 强项 | 风险/短板 |
|---|---|---|---|---|---|
| OpenAI Codex / Codex CLI | OpenAI coding agent；本地 CLI + cloud agent | CLI 本地读写运行；cloud sandbox 并行任务；Codex app 管理多 agent | 本地终端 agent、审批模式、云 sandbox、并行 worktree、skills、automations | OpenAI 模型与产品分发强，终端/云双形态 | 生态绑定；本地 full-auto 仍需强权限边界 |
| Claude Code | Anthropic agentic coding tool | 终端/IDE/桌面/web；Claude Code harness + MCP + hooks | 读代码、编辑文件、运行命令、commits、MCP、hooks、slash commands、CLAUDE.md、GitHub Action | 编码体验成熟、项目记忆与 hooks 强 | Claude 绑定；成本和权限管理需要关注 |
| Gemini CLI | Google 开源终端 agent | ReAct loop + built-in tools + local/remote MCP | bug fix、feature、test coverage、web search/fetch、grep、terminal、file read/write | 免费额度与开源分发强，1M context 叙事强 | Google 模型/Code Assist 体系绑定 |
| Goose | Block/AAIF 本地开源 agent | Rust + desktop/CLI/API；MCP extensions；ACP server | 70+ MCP extensions、15+ provider、recipes、subagents、sandbox、permissions、prompt injection detection | 开放、跨模型、MCP/ACP 生态强，本地工作流好 | 通用 agent 范围大，编码专项深度不如 Claude/Codex |
| OpenHands | 开源云编码 agent 平台 | Python/TS；agent SDK + CLI + cloud；Docker/process/remote sandbox | repo task、PR review、fix vulnerabilities、migrations、incident triage、GitHub/GitLab/Slack/API | 开源 Devin 替代，沙箱和云规模化强 | 系统重；部署/安全/成本复杂 |
| SWE-agent | 研究型软件工程 agent | Agent-Computer Interface：定制 search/view/edit/test 命令 | GitHub issue 自动修复、ACI、linter-gated edit、paginated viewer、repo search | “工具界面设计影响 agent 能力”的关键范式 | 更偏研究/benchmark；产品化 runtimes/UX 少 |
| GitHub Copilot coding agent | GitHub 背景 PR agent | GitHub issue/PR/agents panel/CLI/MCP 触发；Actions ephemeral env | fix bugs、feature、tests、docs、tech debt、创建 PR、review 迭代 | GitHub 原生分发、权限和 PR 流程自然 | 强 GitHub 绑定；用户需 review，复杂任务仍不稳定 |
| Cursor Background Agents | Cursor 异步远程 coding agents | isolated Ubuntu VM；GitHub clone + branch；API 可创建/管理 | 后台编辑/运行、follow-up、take over、最多 256 active agents/API key | IDE 用户基础强；后台任务和 API 值得参考 | 自动命令执行带数据外泄和破坏性操作风险 |
| Windsurf Cascade | IDE 内 agentic coding assistant | Code/Chat/Write mode；planning agent；tool calls；real-time awareness | todo list、queued messages、MCP、terminal、web/docs search、checkpoints/revert、linter auto-fix、AGENTS.md | flow awareness 与 IDE 上下文很强 | IDE 绑定；多 Cascade 并发编辑有冲突风险 |
| Devin | 商业 AI software engineer | 云端 autonomous SWE；团队知识、浏览器/桌面/PR/incident | 复杂工程任务、PR review、visual QA、migration、docs、scheduled chores、bug fixing、incident triage | 高端企业自动化定位，agent fleet 和审计叙事强 | 闭源、成本高、可控性和复现依赖平台 |
| Replit Agent | 从自然语言生成应用的 agent | Replit workspace + app builder + testing/deploy | 全栈 app、数据库、环境、依赖、部署、App Testing、Agents & Automations | 面向非专业/快速原型，端到端 app builder 强 | 泛化为通用 harness 的价值有限；平台绑定 |

资料来源：
[OpenAI Codex](https://openai.com/codex)、[Introducing Codex](https://openai.com/index/introducing-codex/)、[Codex CLI Help](https://help.openai.com/en/articles/11096431-openai-codex-ci-getting-started)、[Codex GitHub](https://github.com/openai/codex)
[Claude Code overview](https://code.claude.com/docs/en/overview)、[Claude Code GitHub Actions](https://code.claude.com/docs/en/github-actions)、[Claude Code hooks](https://docs.anthropic.com/en/docs/claude-code/hooks)
[Gemini CLI docs](https://developers.google.com/gemini-code-assist/docs/gemini-cli)、[Gemini CLI GitHub](https://github.com/google-gemini/gemini-cli)
[Goose docs](https://goose-docs.ai/)、[Goose GitHub](https://github.com/block/goose)、[Goose config](https://goose-docs.ai/docs/guides/config-files)
[OpenHands](https://openhands.dev/)、[OpenHands GitHub](https://github.com/OpenHands/OpenHands)、[OpenHands sandbox docs](https://docs.openhands.dev/openhands/usage/sandboxes/overview)
[SWE-agent ACI](https://swe-agent.com/1.0/background/aci/)、[SWE-agent GitHub](https://github.com/SWE-agent/SWE-agent)
[GitHub Copilot coding agent](https://docs.github.com/en/copilot/concepts/about-assigning-tasks-to-copilot)、[Copilot PR creation](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/assign-copilot-to-an-issue)
[Cursor Background Agents](https://docs.cursor.com/en/background-agents)、[Cursor Background Agents API](https://docs.cursor.com/background-agent/api/overview)
[Windsurf Cascade](https://docs.windsurf.com/windsurf/cascade)、[Windsurf AGENTS.md](https://docs.windsurf.com/windsurf/cascade/agents-md)
[Devin docs](https://docs.devin.ai/)、[Devin website](https://devin.ai/)
[Replit Agent](https://docs.replit.com/core-concepts/agent)、[Replit Agent v2/v3 docs](https://docs.replit.com/replitai/agent-v2)、[Replit Agents & Automations](https://docs.replit.com/replitai/agents-and-automations)

### 3.4 企业自动化 / Harness 平台

| 项目 | 定位 | 实现方式 | 主要功能 | 对 Rowan 的启示 |
|---|---|---|---|---|
| Harness Agents | DevSecOps pipeline-native agents | Agent 是 Harness pipeline 中的 AI step/template | CI autofix、CD remediation、code review、feature flag cleanup、继承 pipeline context/RBAC/secrets/audit | 企业场景要把 agent 放进既有控制平面，而不是让 agent 绕开权限体系 |
| Rebyte Agent Harness | Agent Computer 上的 AI 层 | persistent cloud machine + harness + tools + model routing | terminal/browser/file system/git/skills、executors、model routing、BYOK、admin policy | “agent harness + persistent computer” 是一个可产品化组合 |
| Open Harness | 统一 Agent Harness API | adapters for Anthropic SDK、Goose、LangChain、Letta 等 | 统一 execution/tools/memory API、切换 harness、能力矩阵 | Rowan 应优先支持 adapter/export，减少用户迁移成本 |

资料来源：[Harness Agents](https://developer.harness.io/docs/platform/harness-ai/harness-agents/)、[Rebyte Agent Harness](https://rebyte.ai/docs/agent-computers/agent-harness)、[Open Harness](https://openharness.ai/)

## 4. 功能矩阵

| 能力 | pi-agent-core | yoagent | OpenAI SDK | Claude SDK | LangGraph | Mastra | Goose | OpenHands | SWE-agent | Codex/Claude/Gemini CLI |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 流式事件 | 强 | 强 | 强 | 强 | 中 | 强 | 中 | 强 | 中 | 强 |
| 工具调用 | 强 | 强 | 强 | 强 | 强 | 强 | 强 | 强 | 强 | 强 |
| 工具权限 | 基础 | 中 | 中 | 强 | 自行实现 | 强 | 强 | 强 | 中 | 强 |
| 沙箱执行 | 无 | 内置工具但需部署 | hosted/local tool 视情况 | 强 | 自行实现 | 平台层 | sandbox mode | Docker/remote/process | repo env | 本地/云 sandbox |
| 上下文压缩 | 无/自行 | 强 | 中 | 强 | checkpoint/state | memory processors | 中 | 中 | 依赖 prompt/ACI | 强 |
| steering / follow-up | 强 | 强 | 中 | 中 | 可实现 | 中 | 中 | 中 | 弱 | 产品级 queue/continue |
| durable execution | 弱 | 弱 | 中 | session | 强 | 强 | 中 | 中 | 弱 | 云端产品级 |
| 多 agent | 弱 | 子 agent | handoffs | subagents/plugins | 强 | networks | subagents | micro-agents | 弱 | 并行 cloud agents |
| tracing / replay | 事件基础 | 事件基础 | tracing 强 | monitoring | checkpoint 强 | OTel/evals 强 | logs | artifacts/trace | trajectory | 产品级 logs |
| eval/scoring | 无 | 无 | 外接 | 外接 | 外接 | scorers | 无 | benchmark/SDK | benchmark | 产品侧少暴露 |
| 协议生态 | 无 | provider 多 | MCP/hosted tools | MCP | LangChain ecosystem | MCP | MCP/ACP | integrations | ACI | MCP/IDE/GitHub |

## 5. 关键实现模式对比

### 5.1 Minimal Loop

代表：pi-agent-core、yoagent。

```text
messages + state
  -> model stream
  -> text/toolcall events
  -> execute tools
  -> append tool results
  -> continue or finish
```

优点是极简、可嵌入、可替换模型。缺点是生产能力需要外部补齐：沙箱、权限、trace persistence、eval、workflow。

Rowan 建议：核心坚持 minimal loop，但把事件模型、工具 ABI、trace schema 做成稳定协议。

### 5.2 Graph / Workflow

代表：LangGraph、Microsoft Agent Framework、CrewAI Flows、Mastra Workflows、LlamaIndex Workflows。

优点是适合长任务、human-in-loop、恢复、显式控制流。缺点是上手较重，容易把“agent 的自由探索”变成“流程编排器”。

Rowan 建议：workflow 作为外层 executor，不要污染核心 loop。先让 `AgentRun` 可被 workflow 节点调用。

### 5.3 Multi-Agent / Handoff

代表：OpenAI handoffs、CrewAI crews、Mastra networks、Goose subagents、Codex/Devin/OpenHands 并行 agents。

优点是可分工、并行、角色化。缺点是上下文污染、成本膨胀、协调开销高。

Rowan 建议：不要默认多 agent。先支持 `agent.asTool()` / `SubAgentTool`，让子 agent 是一种普通 tool，继承明确的权限和预算。

### 5.4 Agent-Computer Interface

代表：SWE-agent、OpenHands、Codex、Claude Code、Goose、Cursor、Windsurf。

关键经验：给模型“好用的电脑界面”比直接丢 shell 更重要。SWE-agent 的 custom search/view/edit/lint feedback 是典型样板。

Rowan 建议内置 ACI 层：

- `workspace.search`
- `workspace.open`
- `workspace.edit`
- `workspace.patch`
- `workspace.run`
- `workspace.test`
- `workspace.diff`

每个工具都要有结构化输出、预算、权限、事件和可回放记录。

### 5.5 Memory-First Stateful Agent

代表：Letta、Agno、Claude Code、Windsurf、Replit。

优点是体验上更像持续协作者。缺点是 memory 污染、隐私、过期知识和迁移复杂。

Rowan 建议：早期只做三层记忆：

1. run memory：本次运行中的 messages、tool results、artifacts。
2. project memory：用户显式写入的 `AGENTS.md` / `ROWAN.md` / repo facts。
3. trace memory：历史运行摘要、失败经验、决策日志。

不要一开始做完全自编辑长期记忆。

## 6. Rowan 的差异化机会

### 6.1 产品定位

建议定位：

```text
Rowan Agent Harness:
一个可嵌入、可回放、可评测、可治理的 Agent 运行时。
它不是聊天机器人框架，也不是 IDE 插件，而是让任何 Agent 安全可靠运行的核心 harness。
```

### 6.2 目标用户

优先用户：

- 想把 coding agent 嵌入自己产品的开发者。
- 想做私有化 agent runtime 的团队。
- 需要 trace/replay/eval 的 agent infra 团队。
- 需要在本地、CI、云 runner 之间统一 agent 行为的工程团队。

暂不优先：

- 只想做无代码 app builder 的用户。
- 强依赖单一 IDE 的用户。
- 企业级全套 control plane 用户。

### 6.3 核心卖点

| 卖点 | 为什么重要 | 竞品参照 |
|---|---|---|
| Event-sourced agent runs | 每一步模型、工具、权限、结果都可审计、可重放 | pi-agent-core、yoagent、OpenAI tracing、OpenHands |
| Stable Tool ABI | 工具可跨 agent/provider/workflow 复用 | MCP、OpenAI tools、Haystack Tool、Mastra tools |
| ACI-first coding tools | 让模型更可靠地理解 repo、编辑文件、跑测试 | SWE-agent、Codex、Claude Code |
| Trace replay / fork | 失败不是废品，可以从某一步继续、比较策略 | LangGraph checkpoint、OpenAI tracing |
| Policy and approvals | 避免 Cursor/Replit 类破坏性自动执行事故 | Goose permissions、Codex approval modes、Claude permissions |
| Eval as first-class | Harness 不是只跑 agent，而是持续改进 agent | Mastra scorers、SWE-bench、OpenAI traces |
| Provider-agnostic | 不把用户锁进单一模型 | pi-agent-core、yoagent、Goose |

## 7. 建议架构

```text
rowan-core
  AgentLoop
  EventBus
  RunState
  ToolRuntime
  ModelAdapter
  ContextManager
  PolicyEngine

rowan-aci
  workspace.open/search/edit/patch/diff
  shell.run
  browser.fetch/search
  test.run

rowan-trace
  JSONL trace store
  replay/fork
  trace diff
  artifact store

rowan-workflow
  graph executor
  subagent tool
  human checkpoint

rowan-eval
  datasets
  scorers
  regression runner
  model/provider comparison

rowan-adapters
  OpenAI
  Anthropic
  Gemini
  OpenAI-compatible
  MCP client/server
  CLI/API bindings
```

## 8. MVP 路线

### MVP 1：最小 Harness 内核

目标：对标 pi-agent-core / yoagent。

- `Agent`
- `AgentLoop`
- `StreamFn` / `ModelAdapter`
- `ToolRegistry`
- `AgentEvent`
- cancellation
- steering
- follow-up queue
- run limits
- JSONL trace

### MVP 2：Workspace ACI

目标：对标 SWE-agent 的界面设计，而不是裸 shell。

- read/list/search/open
- patch/edit
- run command with policy
- test runner
- diff summary
- lint/test feedback format

### MVP 3：Trace / Replay / Fork

目标：形成 Rowan 的核心护城河。

- `rowan trace show`
- `rowan replay <run_id>`
- `rowan fork <run_id> --from-step N`
- trace comparison
- artifact collection

### MVP 4：Eval Harness

目标：让用户能比较 agent 配置、模型和工具策略。

- dataset yaml/jsonl
- exact/schema/test/LLM judge scorers
- batch runs
- score report
- cost/latency/tokens report

### MVP 5：Workflow and Subagents

目标：加入外层 orchestration，但不破坏核心 loop。

- graph executor
- subagent tool
- human approval node
- parallel task fanout

## 9. 风险与反模式

| 风险 | 说明 | 规避 |
|---|---|---|
| 过早做大而全 framework | 容易变成 LangGraph/CrewAI/Mastra 的弱复制 | 核心只做 runtime/harness，workflow/eval/adapters 分层 |
| 裸 shell 权限过大 | agent 可破坏文件、数据库、云资源 | 默认 read-only；写入/命令/网络分级审批；危险命令拦截 |
| trace 只记日志不可回放 | 日志无法成为调试资产 | 记录 model input/output、tool input/output、环境摘要、artifact hash |
| memory 自动污染 | agent 写入错误长期记忆后持续影响行为 | 早期只做显式 memory 和 run summary；自编辑 memory 需要 review |
| 多 agent 先行 | 成本高、调度难、质量不稳定 | 子 agent 作为 tool，受预算和权限约束 |
| provider 绑定 | 竞争对手模型变化很快 | `ModelAdapter` + standardized event schema |

## 10. 最推荐的 Rowan 方向

Rowan 不应该做“又一个 Agent 框架”。更好的表述是：

> Rowan 是面向工程化 Agent 的 harness runtime：把模型调用、工具执行、上下文管理、权限、trace、replay、eval 和 workflow 边界标准化。

最小差异化闭环：

```text
run agent
  -> stream events
  -> execute typed tools under policy
  -> persist full trace
  -> replay/fork failed run
  -> evaluate against dataset
  -> compare harness/model/tool-policy changes
```

这条链路一旦做扎实，Rowan 会和普通 agent framework 拉开距离：它不是“帮你写 prompt”，而是“让 agent 变成可以工程化管理的进程”。
