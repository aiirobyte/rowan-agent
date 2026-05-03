# Rowan v0.4.2 Task Board

> 版本：v0.4.2
> 日期：2026-05-03
> 状态：planned
> 范围：Agent loop IO atomization and runtime phase ports

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
| M1 | Agent loop contracts |
| M2 | Phase runner and phase IO split |
| M3 | Runtime ports and tool runner seam |
| M4 | Tests |
| M5 | Release verification |

## 3. Tasks

| ID | Milestone | Task | Type | Priority | Depends On | Status | Acceptance |
|---|---|---|---|---|---|---|---|
| V042-001 | M0 | Create v0.4.2 execution docs | docs | P0 | - | planned | `README.md`, `PLAN.md`, and `TASKS.md` exist |
| V042-002 | M0 | Update roadmap/index/architecture links | docs | P0 | V042-001 | planned | v0.4.2 is the next planned version and v0.5.0 is context/provider IR |
| V042-101 | M1 | Define Agent loop config/state/context contracts | agent | P0 | V042-002 | planned | `AgentLoopConfig`, `AgentRunState`, and `AgentContext` exist and are used by the loop |
| V042-102 | M1 | Define typed phase IO contracts | agent | P0 | V042-101 | planned | `PhaseInputMap`, `PhaseOutputMap`, phase input/output aliases, and `PhaseResult` exist |
| V042-103 | M1 | Define runtime phase port contract | agent/runtime | P0 | V042-102 | planned | `AgentRuntimePort` supports before/after phase input/output, skip, retry, and abort |
| V042-201 | M2 | Extract model turn collector | agent | P0 | V042-101 | planned | collector returns text, structured output, tool calls, usage, and turn entries without owning phase policy |
| V042-202 | M2 | Refactor route phase to typed IO | agent | P0 | V042-201 | planned | route helper does not receive the full loop runtime |
| V042-203 | M2 | Refactor plan phase to typed IO | agent | P0 | V042-201 | planned | plan helper does not receive the full loop runtime |
| V042-204 | M2 | Refactor execute model phase to typed IO | agent | P0 | V042-201 | planned | execute model helper returns text, tool calls, and task output |
| V042-205 | M2 | Refactor verify phase to typed IO | agent | P0 | V042-201 | planned | verify helper does not receive the full loop runtime |
| V042-206 | M2 | Add `runPhase()` orchestration wrapper | agent | P0 | V042-202,V042-203,V042-204,V042-205 | planned | before/after runtime hooks wrap all LLM phases |
| V042-301 | M3 | Add runtime-owned `ToolRunner` seam | agent/runtime | P0 | V042-204 | planned | default path can execute tools through a tool runner port |
| V042-302 | M3 | Preserve tool hook compatibility | agent/runtime | P0 | V042-301 | planned | existing `beforeToolCall` and `afterToolCall` behavior remains unchanged |
| V042-303 | M3 | Keep task retry and verification in Agent loop | agent | P0 | V042-301 | planned | runtime tool runner does not own task attempts or outcome rules |
| V042-401 | M4 | Add runtime phase port tests | test | P0 | V042-206 | planned | tests cover before adjustment, after adjustment, skip, retry, abort, and no-hook behavior |
| V042-402 | M4 | Preserve existing behavior tests | test | P0 | V042-301 | planned | direct, task, thread, budget, multi-turn, and verify retry tests pass |
| V042-501 | M5 | Run package tests | release | P0 | V042-401,V042-402 | planned | `bun test packages` passes |
| V042-502 | M5 | Run build | release | P0 | V042-501 | planned | `bun run build` passes |
| V042-503 | M5 | Update v0.4.2 docs after implementation | docs | P1 | V042-502 | planned | task statuses and roadmap status reflect implementation result |

## 4. Release Checklist

- [ ] v0.4.2 planning docs created and linked
- [ ] `AgentLoopConfig`, `AgentRunState`, and `AgentContext` defined
- [ ] typed phase input/output contracts defined
- [ ] runtime phase port contract defined
- [ ] route / plan / execute / verify helpers use typed IO
- [ ] `runPhase()` wraps all LLM phases
- [ ] tool execution can use a runtime-owned `ToolRunner` port
- [ ] existing tool hooks remain compatible
- [ ] runtime hooks can adjust, skip, retry, and abort phases
- [ ] direct/task/thread/budget/multi-turn/verify retry tests pass
- [ ] `bun test packages`
- [ ] `bun run build`

## 5. Explicitly Out of v0.4.2

- [ ] context projection/rendering pipeline
- [ ] provider-neutral `ConversationEntry[]`
- [ ] SSE streaming parser
- [ ] full PolicyEngine
- [ ] full MCP server/client integration
- [ ] replay / fork / compaction
- [ ] workflow graph
- [ ] eval harness
