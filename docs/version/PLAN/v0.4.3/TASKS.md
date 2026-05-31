# Rowan v0.4.3 Task Board

> Migrated planning entry: use `docs/version/0.4.3/todo.md` for active v0.4.3 work. This file is retained as the original planning draft.

> 版本：v0.4.3
> 日期：2026-05-04
> 状态：planned
> 范围：Agent loop package-boundary consolidation

## 1. Status Legend

| Status | Meaning |
|---|---|
| planned | Not started |
| in-progress | Actively being implemented |
| implemented | Complete and release-gate verified |
| deferred | Explicitly moved out of this version |

## 2. Milestones

| Milestone | Goal |
|---|---|
| M0 | Planning and boundary lock |
| M1 | Protocol phase output contracts |
| M2 | Adapter typed stream output |
| M3 | Runtime tool execution primitives |
| M4 | Agent loop consolidation |
| M5 | Tests and release verification |

## 3. Tasks

| ID | Milestone | Task | Type | Priority | Depends On | Status | Acceptance |
|---|---|---|---|---|---|---|---|
| V043-001 | M0 | Create v0.4.3 planning docs | docs | P0 | - | implemented | `README.md`, `PLAN.md`, and `TASKS.md` exist |
| V043-002 | M0 | Update roadmap/index/architecture links | docs | P0 | V043-001 | implemented | v0.4.3 is discoverable and positioned before v0.5.0 |
| V043-003 | M0 | Create architecture-review document structure | docs | P0 | V043-002 | implemented | `CONTEXT.md`, `docs/adr/`, `docs/architecture/module-map.md`, and `docs/architecture/deepening-opportunities.md` exist |
| V043-101 | M1 | Move shared phase output contracts into protocol | protocol/agent | P0 | V043-003 | planned | shared phase output types are importable without depending on `agent` |
| V043-102 | M1 | Add typed phase-output stream event contract | protocol/adapters/agent | P0 | V043-101 | planned | adapter and agent can exchange typed phase output without `unknown` as the primary contract |
| V043-103 | M1 | Preserve StreamFn compatibility during migration | protocol/adapters/agent | P1 | V043-102 | planned | existing tests can migrate incrementally without breaking the CLI composition path |
| V043-201 | M2 | Update OpenAI-compatible adapter to emit typed phase outputs | adapters | P0 | V043-102 | planned | route/plan/verify structured outputs are normalized in adapter-owned code |
| V043-202 | M2 | Keep provider schema errors in adapters | adapters | P0 | V043-201 | planned | invalid provider output still raises adapter errors with useful codes/details |
| V043-203 | M2 | Update adapter tests for typed phase output | test | P0 | V043-201 | planned | adapter tests assert typed phase output events for route/plan/execute/verify |
| V043-301 | M3 | Add runtime event-neutral tool execution primitive | runtime | P0 | V043-102 | planned | runtime can execute one prepared tool call without AgentEvent knowledge |
| V043-302 | M3 | Move default tool argument validation to runtime | runtime/agent | P0 | V043-301 | planned | default tool path validates args outside `agent/src/loop.ts` |
| V043-303 | M3 | Cache compiled tool schema validators | runtime | P1 | V043-302 | planned | repeated tool calls do not recompile unchanged schemas |
| V043-304 | M3 | Preserve before/after tool hook behavior | runtime/agent | P0 | V043-301 | planned | hook approval, blocking, review, and errors match v0.4.2 behavior |
| V043-401 | M4 | Replace Agent-local provider output parsing | agent/adapters | P0 | V043-201 | planned | loop consumes typed adapter output and no longer owns provider JSON repair |
| V043-402 | M4 | Use runtime tool execution primitive from Agent loop | agent/runtime | P0 | V043-301 | planned | default tool calls go through runtime-owned execution primitive |
| V043-403 | M4 | Keep Agent-owned lifecycle/effects/outcomes | agent | P0 | V043-401,V043-402 | planned | `runAgentLoop()` still owns events, session effects, turns, attempts, verification, thread depth, and outcomes |
| V043-404 | M4 | Avoid new Agent-local runtime/model-stream files | agent | P0 | V043-403 | planned | no `packages/agent/src/runtime.ts` or `packages/agent/src/model-stream.ts` is introduced |
| V043-501 | M5 | Update package boundary tests | test | P0 | V043-401,V043-402 | planned | boundary rules pass and still prevent `agent -> adapters` |
| V043-502 | M5 | Preserve Agent behavior tests | test | P0 | V043-403 | planned | direct/task/thread/multi-turn/limits/verify retry tests pass |
| V043-503 | M5 | Add runtime tool execution tests | test | P0 | V043-301 | planned | unknown tool, invalid args, blocked call, successful call, and after-hook result are covered |
| V043-504 | M5 | Run package tests | release | P0 | V043-501,V043-502,V043-503 | planned | `bun test packages` passes |
| V043-505 | M5 | Run build | release | P0 | V043-504 | planned | `bun run build` passes |
| V043-506 | M5 | Finalize v0.4.3 docs after implementation | docs | P1 | V043-505 | planned | docs status and task board reflect implementation result |

## 4. Release Checklist

- [x] v0.4.3 planning docs created
- [x] roadmap/index/architecture links updated
- [x] architecture-review docs created
- [ ] shared phase output contracts available from `protocol`
- [ ] adapter emits typed phase outputs
- [ ] runtime owns default tool execution primitive
- [ ] Agent loop consumes typed model output and runtime tool execution
- [ ] no new Agent-local `runtime.ts` or `model-stream.ts`
- [ ] `agent` does not import `adapters`
- [ ] package boundary tests pass
- [ ] Agent behavior tests pass
- [ ] runtime tool execution tests added
- [ ] `bun test packages`
- [ ] `bun run build`

## 5. Explicitly Out of v0.4.3

- [ ] context projection/rendering pipeline
- [ ] provider-neutral `ConversationEntry[]`
- [ ] full PolicyEngine
- [ ] full MCP server/client integration
- [ ] replay / fork / compaction
- [ ] workflow graph
- [ ] public API stabilization
