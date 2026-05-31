# Rowan v0.4.1 Task Board

> 版本：v0.4.1
> 日期：2026-05-03
> 状态：implemented
> 范围：Agent/runtime boundary correction before context projection

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
| M0 | Boundary lock |
| M1 | Move Agent driver files |
| M2 | Simplify Agent execution entry |
| M3 | Runtime glue cleanup |
| M4 | Boundary tests and docs |

## 3. Tasks

| ID | Milestone | Task | Type | Priority | Depends On | Status | Acceptance |
|---|---|---|---|---|---|---|---|
| V041-001 | M0 | Create v0.4.1 execution docs | docs | P0 | - | implemented | `README.md`, `PLAN.md`, and `TASKS.md` exist |
| V041-002 | M0 | Update roadmap/index/architecture links | docs | P0 | V041-001 | implemented | v0.4.1 appears before v0.5.0 and is discoverable |
| V041-003 | M0 | Lock no-core-folder constraint | docs | P0 | V041-001 | implemented | docs state no `packages/agent/src/core/` and no new core package |
| V041-004 | M0 | Lock no compatibility re-export constraint | docs | P0 | V041-001 | implemented | docs state removed runtime loop/thread/phase exports are not preserved |
| V041-101 | M1 | Move Agent loop into `agent` | agent/runtime | P0 | V041-004 | implemented | `packages/agent/src/loop.ts` owns `runAgentLoop`; runtime loop export removed |
| V041-102 | M1 | Move thread runner into `agent` | agent/runtime | P0 | V041-101 | implemented | `packages/agent/src/thread.ts` owns `runAgentThread`; runtime thread export removed |
| V041-103 | M1 | Move phase modules into `agent` | agent/runtime | P0 | V041-101 | implemented | `packages/agent/src/phases/*` owns route/plan/execute/verify phase metadata/helpers |
| V041-104 | M1 | Decide turn recorder ownership during move | agent/runtime | P1 | V041-101 | implemented | turn recording moved into `agent` so the Agent loop does not import runtime-owned driver semantics |
| V041-201 | M2 | Remove redundant `AgentRunner` wrapper | agent/runtime | P1 | V041-101 | implemented | `Agent.prompt()` calls the Agent loop directly |
| V041-202 | M2 | Keep `agent.ts` as core/facade entrypoint | agent | P0 | V041-101,V041-102 | implemented | no `core/` folder exists; Agent owns lifecycle plus loop entry wiring |
| V041-203 | M2 | Update tests importing loop/thread/phases | test | P0 | V041-101,V041-103 | implemented | tests import Agent-owned paths or public Agent API |
| V041-301 | M3 | Trim runtime index exports | runtime | P0 | V041-101,V041-103 | implemented | runtime exports only glue/integration modules |
| V041-302 | M3 | Keep runtime tools/skills/hooks/MCP integration | runtime/cli | P0 | V041-301 | implemented | CLI can still compose workspace tools, skills, hooks, and MCP boundary |
| V041-303 | M3 | Update runtime README terminology | docs/runtime | P1 | V041-301 | implemented | runtime README no longer calls runtime the Agent execution kernel |
| V041-401 | M4 | Update package boundary tests | test/build | P0 | V041-301 | implemented | boundary tests encode corrected Agent/runtime ownership |
| V041-402 | M4 | Update Agent README terminology | docs/agent | P1 | V041-202 | implemented | agent README names Agent core/facade and driver ownership |
| V041-403 | M4 | Run package tests | release | P0 | V041-401 | implemented | `bun test packages` passes |
| V041-404 | M4 | Run build | release | P0 | V041-401 | implemented | `bun run build` passes |
| V041-405 | M4 | Run CLI smoke tests | release | P0 | V041-403,V041-404 | implemented | direct/task/session continuation behavior is unchanged |

## 4. Release Checklist

- [x] v0.4.1 planning docs created and linked
- [x] no new `core` package or `core/` folder introduced
- [x] no compatibility re-exports for removed runtime loop/thread/phase APIs
- [x] Agent loop moved to `packages/agent/src/loop.ts`
- [x] thread runner moved to `packages/agent/src/thread.ts`
- [x] phases moved to `packages/agent/src/phases/*`
- [x] `packages/agent/src/agent.ts` remains core/facade entrypoint
- [x] runtime exports trimmed to glue/integration modules
- [x] package boundary tests updated
- [x] `bun test packages`
- [x] `bun run build`
- [x] CLI smoke tests

## 5. Explicitly Out of v0.4.1

- [ ] context projection/rendering pipeline
- [ ] provider-neutral `ConversationEntry[]`
- [ ] SSE streaming parser
- [ ] PolicyEngine
- [ ] full MCP server/client integration
- [ ] replay / fork / compaction
- [ ] workflow graph
- [ ] eval harness
