# Rowan v0.0.0 Task Board

> 版本：v0.0.0
> 日期：2026-04-30
> 状态：implemented
> 范围：单包 TypeScript + Bun 最简 Agent 内核

## 1. Status Legend

| Status | Meaning |
|---|---|
| todo | 未开始 |
| doing | 进行中 |
| blocked | 阻塞 |
| done | 完成 |

## 2. Milestone Tasks

| ID | Milestone | Task | Type | Priority | Depends On | Status | Acceptance |
|---|---|---|---|---|---|---|---|
| V0-001 | M0 | 初始化 Bun + TypeScript 单包项目 | scaffold | P0 | - | done | `bun install` 成功 |
| V0-002 | M0 | 配置 `tsconfig.json` 和 build script | scaffold | P0 | V0-001 | done | `bun run build` 成功 |
| V0-003 | M0 | 配置 Bun test | test | P0 | V0-001 | done | `bun test` 成功 |
| V0-004 | M0 | 创建 `src/` 和 `test/` 基础结构 | scaffold | P0 | V0-001 | done | 空测试通过 |
| V0-101 | M1 | 定义 `Session` / `AgentMessage` | core | P0 | V0-004 | done | messages 与 log 分离 |
| V0-102 | M1 | 定义 `Task` / `AcceptanceCriterion` schema | core | P0 | V0-004 | done | criteria 是结构化 schema |
| V0-103 | M1 | 定义 `Outcome` / `Evidence` | core | P0 | V0-004 | done | Outcome 可表达 pass/fail |
| V0-104 | M1 | 定义 `Tool` / `ToolResult` / `ToolCall` | core | P0 | V0-004 | done | tool 有 TypeBox 1.x 参数 schema |
| V0-105 | M1 | 定义 `AgentEvent` | core | P0 | V0-004 | done | 覆盖 session/task/tool/verification/outcome |
| V0-106 | M1 | 定义 `Skill` / `SkillLoader` 类型 | core | P1 | V0-004 | done | Skill 指向 `SKILL.md` |
| V0-201 | M2 | 实现 `FakeStreamFn` 文本输出 | stream | P0 | V0-101 | done | 可输出 `text_delta` |
| V0-202 | M2 | 实现 `FakeStreamFn` 结构化 task 输出 | stream | P0 | V0-102,V0-201 | done | 可生成 Task |
| V0-203 | M2 | 实现 `FakeStreamFn` tool call 输出 | stream | P0 | V0-104,V0-201 | done | 可生成 ToolCall |
| V0-204 | M2 | 实现 `FakeStreamFn` verification 输出 | stream | P0 | V0-103,V0-201 | done | 可生成 VerificationResult |
| V0-301 | M3 | 实现 `runAgentLoop()` plan task 阶段 | loop | P0 | V0-202 | done | user input -> Task |
| V0-302 | M3 | 实现 tool lookup 和参数校验 | loop | P0 | V0-104,V0-203 | done | invalid args 不执行 |
| V0-303 | M3 | 实现 demo `echo` tool | tool | P0 | V0-104 | done | echo tool 测试通过 |
| V0-304 | M3 | 实现 `beforeToolCall` hook | loop | P0 | V0-302 | done | 可 block tool |
| V0-305 | M3 | 实现 `afterToolCall` hook | loop | P1 | V0-302 | done | 可修改 tool result |
| V0-306 | M3 | 实现 verification 阶段 | verifier | P0 | V0-204 | done | 同模型判断 criteria |
| V0-307 | M3 | 实现 retry/maxAttempts | loop | P1 | V0-306 | done | verification fail 后可重试 |
| V0-308 | M3 | 实现 loop 事件发布 | event | P0 | V0-105,V0-301 | done | session/task/tool/verification 事件出现 |
| V0-401 | M4 | 实现 `Agent` class | agent | P0 | V0-301,V0-308 | done | `agent.prompt()` 可返回 Outcome |
| V0-402 | M4 | 实现 `subscribe()` | agent | P0 | V0-401 | done | listener 能收到事件 |
| V0-403 | M4 | 实现 `abort()` | agent | P1 | V0-401 | done | AbortSignal 能中断 loop |
| V0-404 | M4 | 实现 `waitForIdle()` | agent | P1 | V0-401 | done | pending run 完成后 resolve |
| V0-501 | M5 | 实现 `loadSkill(path)` | skill | P0 | V0-106 | done | 能读取 `SKILL.md` |
| V0-502 | M5 | 实现 skill 注入 prompt context | skill | P0 | V0-501,V0-301 | done | model context 包含 skill content |
| V0-503 | M5 | 添加 example `skills/example/SKILL.md` | docs | P1 | V0-501 | done | 示例 skill 可被测试加载 |
| V0-601 | M6 | 实现 JSONL trace subscriber | trace | P0 | V0-402 | done | events 写入 JSONL |
| V0-602 | M6 | 实现 trace redaction v0.0.0 | trace | P1 | V0-601 | done | 常见 API key pattern 被隐藏 |
| V0-603 | M6 | 测试 trace 包含关键事件 | test | P0 | V0-601 | done | trace 中有 outcome |
| V0-701 | M7 | 实现 CLI 参数解析 | cli | P0 | V0-401 | done | `bun run rowan --help` |
| V0-702 | M7 | 实现 `--fake` 运行路径 | cli | P0 | V0-701,V0-401 | done | `bun run rowan --fake "hello"` |
| V0-703 | M7 | 实现 `--trace <path>` | cli | P0 | V0-702,V0-601 | done | CLI 可写 trace |
| V0-704 | M7 | CLI 输出 Outcome | cli | P0 | V0-702 | done | stdout 显示 pass/message |
| V0-801 | M8 | 编写 README quickstart | docs | P0 | V0-702 | done | 10 分钟内跑通 |
| V0-802 | M8 | 编写 v0.0.0 API 示例 | docs | P1 | V0-401 | todo | 展示 Agent API |
| V0-803 | M8 | 编写 SKILL.md 示例说明 | docs | P1 | V0-501 | todo | skill 语义清楚 |
| V0-804 | M8 | 执行 v0.0.0 release checklist | release | P0 | V0-801 | done | 全部验收命令通过 |

## 3. v0.0.0 Release Checklist

- [x] `bun install` 成功。
- [x] `bun test` 成功。
- [x] `bun run build` 成功。
- [x] `bun run rowan --fake "hello"` 成功。
- [x] `bun run rowan --fake "use echo tool"` 成功。
- [x] `bun run rowan --fake --trace .rowan/runs/latest.jsonl "use echo tool"` 成功。
- [x] Agent 能生成结构化 task。
- [x] Agent 能调用 demo tool。
- [x] Agent 能验证 acceptance criteria。
- [x] Session log 和 model messages 分离。
- [x] Skill 能从 `SKILL.md` 加载。
- [x] JSONL trace 包含 outcome。
- [x] unknown tool 不 crash。
- [x] invalid args 不执行工具。

## 4. Explicitly Out of v0.0.0

- [ ] real model adapter。
- [ ] workspace tools。
- [ ] shell tool。
- [ ] eval runner。
- [ ] policy engine。
- [ ] replay/fork。
- [ ] thread runner。
- [ ] workflow。
- [ ] MCP。
- [ ] Web UI。
