# Rowan v0.1 Task Board

> 版本：v0.1
> 日期：2026-05-01
> 状态：已实现，待真实 API 手动验收
> 范围：OpenAI-compatible 真实模型接入

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
| V01-001 | M0 | 定义 `OpenAICompatibleConfig` | model | P0 | - | done | 支持 baseUrl/apiKey/model/temperature/fetch |
| V01-002 | M0 | 实现 env config resolver | config | P0 | V01-001 | done | 支持 `.env`/shell env/CLI flags，优先级为 flags > env > default |
| V01-003 | M0 | 实现 JSON extraction utility | model | P0 | - | done | raw/fenced/surrounding text 均可解析 |
| V01-004 | M0 | 实现 phase prompt builder | prompt | P0 | - | done | plan/execute/verify prompt 测试通过 |
| V01-101 | M1 | 实现 Chat Completions fetch client | model | P0 | V01-001 | done | mock fetch 可返回 content |
| V01-102 | M1 | 实现 HTTP error normalization | model | P0 | V01-101 | done | 401/429/5xx 有结构化错误 |
| V01-103 | M1 | 支持 request timeout / abort signal | model | P1 | V01-101 | done | abort 通过 request signal 支持，mock 路径覆盖 |
| V01-201 | M2 | 实现 plan phase mapping | stream | P0 | V01-003,V01-004,V01-101 | done | response -> Task |
| V01-202 | M2 | 实现 execute phase mapping | stream | P0 | V01-003,V01-004,V01-101 | done | response -> ToolCall[] |
| V01-203 | M2 | 实现 verify phase mapping | stream | P0 | V01-003,V01-004,V01-101 | done | response -> VerificationResult |
| V01-204 | M2 | TypeBox validation on model outputs | stream | P0 | V01-201,V01-202,V01-203 | done | invalid schema 报错 |
| V01-205 | M2 | 导出 `createOpenAICompatibleStream()` | stream | P0 | V01-201,V01-202,V01-203 | done | 可作为 v0 `StreamFn` 使用 |
| V01-301 | M3 | CLI 默认使用真实模型 runtime | cli | P0 | V01-205 | done | 直接运行 `bun run rowan "hello"` |
| V01-302 | M3 | CLI 增加 `--base-url` / `--api-key` / `--model` | cli | P0 | V01-301 | done | flags override env |
| V01-303 | M3 | 移除 CLI fake runtime | cli | P0 | V01-301 | done | `--fake` 被拒绝为未知参数 |
| V01-304 | M3 | CLI missing config errors | cli | P0 | V01-302 | done | 缺 key/model 清晰 exit 1 |
| V01-305 | M3 | CLI 默认自动写 trace | cli | P0 | V01-301 | done | `bun run rowan "hello"` 写入 `.rowan/runs/*.jsonl` |
| V01-401 | M4 | Mock model integration tests | test | P0 | V01-205,V01-301 | done | no real API required |
| V01-402 | M4 | Manual real model checklist | docs | P1 | V01-301 | done | README/PLAN 包含手动测试命令 |
| V01-403 | M4 | 更新 root README quickstart | docs | P1 | V01-301 | done | 包含 `.env.example` 和 real model env 示例 |
| V01-404 | M4 | 执行 release checklist | release | P0 | V01-401 | blocked | 真实 API 手动验收需要有效 `ROWAN_OPENAI_API_KEY` / `ROWAN_MODEL` |

## 3. Release Checklist

- [x] `bun test`
- [x] `bun run build`
- [x] mock OpenAI-compatible tests pass
- [ ] `bun run rowan "hello"` works with real env
- [x] `bun run rowan "hello"` writes a default trace with mock real-model runtime
- [ ] `bun run rowan --trace .rowan/runs/real.jsonl "use echo tool"` writes trace with real env
- [x] missing API key exits 1 with clear error

## 4. Explicitly Out of v0.1

- [ ] Anthropic adapter
- [ ] Gemini adapter
- [ ] provider registry
- [ ] native tool calling compatibility matrix
- [ ] SSE streaming parser
- [ ] workspace ACI
- [ ] eval harness
