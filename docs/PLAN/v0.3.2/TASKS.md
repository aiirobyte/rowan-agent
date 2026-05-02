# Rowan v0.3.2 Task Board

> 版本：v0.3.2
> 日期：2026-05-02
> 状态：planned

## 1. Milestones

| Milestone | Goal |
|---|---|
| M0 | Planning and schema scope |
| M1 | Session schema rename and metadata |
| M2 | Thread runner and compatibility API |
| M3 | Route-to-thread main loop |
| M4 | Prompt and adapter updates |
| M5 | Trace/session inspection |
| M6 | Release verification |

## 2. Tasks

| ID | Milestone | Task | Type | Priority | Depends On | Status | Acceptance |
|---|---|---|---|---|---|---|---|
| V032-001 | M0 | Add v0.3.2 planning docs | docs | P0 | - | planned | `PLAN.md`, `TASKS.md`, `README.md` exist and roadmap links to them |
| V032-101 | M1 | Rename Session `userInput` to immutable `input` | session | P0 | V032-001 | planned | persisted session and session snapshots use `input`; append turn does not mutate it |
| V032-102 | M1 | Add optional Session `task` and `goal` | session | P0 | V032-101 | planned | create/persist/load/snapshot preserve task and goal |
| V032-103 | M1 | Introduce current-turn prompt helper | agent/context | P0 | V032-101 | planned | route and plan use latest user turn after multi-turn append |
| V032-201 | M2 | Add `runThread()` using normal `runAgentLoop()` | agent | P0 | V032-102 | planned | child session has parent id, input, task, goal, and normal events |
| V032-202 | M2 | Add `Agent.startThread()` | agent | P0 | V032-201 | planned | current Agent can start child thread with inherited runtime config |
| V032-203 | M2 | Rewire `runSubSession()` / `startSubSession()` to thread implementation | agent | P0 | V032-202 | planned | old tests and public API work through the new path |
| V032-301 | M3 | Extend route schema to direct/task/thread | agent | P0 | V032-103 | planned | parser accepts new `route` field and old `needsTask` field |
| V032-302 | M3 | Add main Session thread route execution | agent | P0 | V032-301,V032-201 | planned | main loop creates child thread and verifies child outcome |
| V032-303 | M3 | Add worker route rule for task/goal Sessions | agent | P0 | V032-302 | planned | child worker does task path instead of recursively re-threading default tool requests |
| V032-401 | M4 | Update route/plan/verify prompts | context | P0 | V032-301 | planned | prompts document thread route and session task/goal semantics |
| V032-402 | M4 | Update OpenAI-compatible normalizers | adapters | P0 | V032-401 | planned | adapter normalizes new route schema and legacy route schema |
| V032-501 | M5 | Emit `thread_created` and `thread_end` events | trace | P0 | V032-201 | planned | trace records parentSessionId, sessionId, prompt, task, goal, outcome |
| V032-502 | M5 | Update trace inspector for thread events | trace | P1 | V032-501 | planned | inspector lists parent/child relationships from new and old events |
| V032-601 | M6 | Update tests for v0.3.2 semantics | test | P0 | V032-101,V032-302 | planned | session, agent, adapter, context, trace tests cover new behavior |
| V032-602 | M6 | Run v0.3.2 release gates | release | P0 | V032-601 | planned | `bun test packages` and `bun run build` pass |

## 3. Release Checklist

- [ ] v0.3.2 docs created and linked
- [ ] Session schema uses immutable `input`
- [ ] Session task/goal tests
- [ ] current-turn prompt tests
- [ ] thread runner tests
- [ ] compatibility sub-session tests
- [ ] route-to-thread main-loop tests
- [ ] OpenAI-compatible route parser tests
- [ ] trace inspector tests for thread events
- [ ] `bun test packages`
- [ ] `bun run build`

## 4. Explicitly Out of v0.3.2

- [ ] workflow DAG
- [ ] persistent replay/fork
- [ ] multi-agent negotiation
- [ ] cross-thread memory
- [ ] UI
