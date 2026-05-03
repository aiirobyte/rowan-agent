# Rowan v0.3.3 Task Board

> 版本：v0.3.3
> 日期：2026-05-03
> 状态：planned

## 1. Milestones

| Milestone | Goal |
|---|---|
| M0 | Planning and scope |
| M1 | Storage port and schemas |
| M2 | JSON-backed store |
| M3 | Agent loop storage split |
| M4 | Context scope rules |
| M5 | Schema replacement and trace alignment |
| M6 | Release verification |

## 2. Tasks

| ID | Milestone | Task | Type | Priority | Depends On | Status | Acceptance |
|---|---|---|---|---|---|---|---|
| V033-001 | M0 | Add v0.3.3 planning docs | docs | P0 | - | planned | `PLAN.md`, `TASKS.md`, `README.md` exist and roadmap/index link to them |
| V033-101 | M1 | Define `ExecutionTurn` and `ContextScope` | session/agent | P0 | V033-001 | planned | Types cover phase, timestamps, model, scope, usage, prompt/text/structured/tool entries |
| V033-102 | M1 | Define `AgentStore` port | session | P0 | V033-101 | planned | Port supports session CRUD plus `appendStep` / `loadSteps` |
| V033-103 | M1 | Replace `SessionStore` persistence usage | session/agent | P1 | V033-102 | planned | New agent persistence path depends on `AgentStore`, not a session-store shim |
| V033-201 | M2 | Implement `InMemoryAgentStore` | session/test | P0 | V033-102 | planned | Tests can store sessions and steps without filesystem |
| V033-202 | M2 | Implement `LocalJsonAgentStore` | cli/session | P0 | V033-102 | planned | CLI stores v0.3.3 JSON with `steps` using atomic writes |
| V033-203 | M2 | Replace CLI `LocalJsonSessionStore` usage | cli | P0 | V033-202 | planned | `list`, `--session`, prompt save/load use `AgentStore` |
| V033-301 | M3 | Split conversation publish from step recording | agent | P0 | V033-201 | planned | Execution phase messages no longer persist into conversation `session.messages` |
| V033-302 | M3 | Record route steps | agent | P0 | V033-301 | planned | route prompt/output/routing decision are persisted as execution `ExecutionTurn` |
| V033-303 | M3 | Record plan/execute/verify steps | agent | P0 | V033-301 | planned | task JSON, execute text/tool calls/tool results, verification result are persisted as steps |
| V033-304 | M3 | Publish only conversation direct/final assistant messages | agent | P0 | V033-301 | planned | direct answers and passed final outcomes enter `session.messages`; failed outcomes stay diagnostic |
| V033-401 | M4 | Add message scope helpers | session/context | P0 | V033-101 | planned | v0.3.3 messages are explicitly scoped as conversation/execution/diagnostic |
| V033-402 | M4 | Add phase-specific prompt allowlists | context | P0 | V033-401,V033-303 | planned | route/plan/execute/verify prompts only include allowed conversation and step evidence |
| V033-403 | M4 | Add contamination regression tests | agent/context | P0 | V033-402 | planned | failed outcome, routing decision, phase prompt, and unrelated tool result do not leak into route |
| V033-501 | M5 | Enforce v0.3.3 persisted schema | session/cli | P0 | V033-202,V033-401 | planned | Old or unversioned session files fail with a clear unsupported schema error |
| V033-502 | M5 | Align trace metadata with scope | trace/agent | P1 | V033-301 | planned | trace deltas for execution/diagnostic messages are explicitly marked |
| V033-503 | M5 | Update trace inspector for steps if exposed | trace | P2 | V033-502 | planned | Inspector can show phase/scope without dumping full prompts |
| V033-601 | M6 | Update docs and examples | docs | P1 | V033-501 | planned | README/architecture references match v0.3.3 storage conversations |
| V033-602 | M6 | Run v0.3.3 release gates | release | P0 | V033-403,V033-501 | planned | `bun test packages` and `bun run build` pass |

## 3. Release Checklist

- [ ] v0.3.3 docs created and linked
- [ ] `ExecutionTurn` model defined
- [ ] `AgentStore` port defined
- [ ] `InMemoryAgentStore` implemented
- [ ] `LocalJsonAgentStore` implemented
- [ ] CLI uses `AgentStore`
- [ ] Persisted schema version is v0.3.3
- [ ] old session schemas fail with a clear unsupported schema error
- [ ] execution phase outputs go to steps
- [ ] conversation messages only contain conversation-scoped user/assistant dialogue
- [ ] phase-specific prompt allowlist tests
- [ ] contamination regression tests
- [ ] `bun test packages`
- [ ] `bun run build`

## 4. Explicitly Out of v0.3.3

- [ ] SQLite / Drizzle
- [ ] provider-agnostic Conversation IR
- [ ] full DCP Projection/Rendering package
- [ ] context compaction
- [ ] trace replay / fork
- [ ] PolicyEngine
- [ ] legacy session migration
