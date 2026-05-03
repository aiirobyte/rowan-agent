# Rowan v0.3.2 Task Board

> 版本：v0.3.2
> 日期：2026-05-02
> 状态：implemented

## 1. Milestones

| Milestone | Goal |
|---|---|
| M0 | Planning and schema scope |
| M1 | Session schema rename and metadata |
| M2 | Thread runner and legacy API removal |
| M3 | Route-to-thread main loop |
| M4 | Prompt and adapter updates |
| M5 | Trace/session inspection |
| M6 | Release verification |

## 2. Tasks

| ID | Milestone | Task | Type | Priority | Depends On | Status | Acceptance |
|---|---|---|---|---|---|---|---|
| V032-001 | M0 | Add v0.3.2 planning docs | docs | P0 | - | done | `PLAN.md`, `TASKS.md`, `README.md` exist and roadmap links to them |
| V032-101 | M1 | Use immutable Session `input` | session | P0 | V032-001 | done | persisted session and session snapshots use `input`; append turn does not mutate it |
| V032-102 | M1 | Add optional Session `task` and `goal` | session | P0 | V032-101 | done | create/persist/load/snapshot preserve task and goal |
| V032-103 | M1 | Introduce current-turn prompt helper | agent/context | P0 | V032-101 | done | route and plan use latest user turn after multi-turn append |
| V032-201 | M2 | Add `runThread()` using normal `runAgentLoop()` | agent | P0 | V032-102 | done | child session has parent id, input, task, goal, and normal events |
| V032-202 | M2 | Add `Agent.startThread()` | agent | P0 | V032-201 | done | current Agent can start child thread with inherited runtime config |
| V032-203 | M2 | Remove old predecessor API | agent | P0 | V032-202 | done | public API exposes thread primitives only |
| V032-301 | M3 | Extend route schema to direct/task/thread | agent | P0 | V032-103 | done | parser accepts the required `route` field |
| V032-302 | M3 | Add main Session thread route execution | agent | P0 | V032-301,V032-201 | done | main loop creates child thread and verifies child outcome |
| V032-303 | M3 | Add worker route rule for task/goal Sessions | agent | P0 | V032-302 | done | child worker does task path instead of recursively re-threading default tool requests |
| V032-401 | M4 | Update route/plan/verify prompts | context | P0 | V032-301 | done | prompts document thread route and session task/goal semantics |
| V032-402 | M4 | Update OpenAI-compatible normalizers | adapters | P0 | V032-401 | done | adapter normalizes the required route schema only |
| V032-501 | M5 | Emit `thread_created` and `thread_end` events | trace | P0 | V032-201 | done | trace records parentSessionId, sessionId, prompt, task, goal, outcome |
| V032-502 | M5 | Update trace inspector for thread events | trace | P1 | V032-501 | done | inspector lists parent/child relationships from thread events |
| V032-601 | M6 | Update tests for v0.3.2 semantics | test | P0 | V032-101,V032-302 | done | session, agent, adapter, context, trace tests cover new behavior |
| V032-602 | M6 | Run v0.3.2 release gates | release | P0 | V032-601 | done | `bun test packages` and `bun run build` pass |

## 3. Release Checklist

- [x] v0.3.2 docs created and linked
- [x] Session schema uses immutable `input`
- [x] Session task/goal tests
- [x] current-turn prompt tests
- [x] thread runner tests
- [x] legacy predecessor API removed
- [x] route-to-thread main-loop tests
- [x] OpenAI-compatible route parser tests
- [x] trace inspector tests for thread events
- [x] `bun test packages`
- [x] `bun run build`

## 4. Explicitly Out of v0.3.2

- [ ] workflow DAG
- [ ] persistent replay/fork
- [ ] multi-agent negotiation
- [ ] cross-thread memory
- [ ] UI
