# Rowan v0.4.0 Task Board

> 版本：v0.4.0
> 日期：2026-05-03
> 状态：planned
> 范围：protocol boundary, runtime split, context import cleanup, runtime terminology, MCP ownership

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
| M1 | Protocol package |
| M2 | Context import cleanup |
| M3 | Runtime package scaffold |
| M4 | Move execution mechanics |
| M5 | Release hardening |

## 3. Tasks

| ID | Milestone | Task | Type | Priority | Depends On | Status | Acceptance |
|---|---|---|---|---|---|---|---|
| V040-001 | M0 | Create v0.4.0 execution docs | docs | P0 | - | planned | `README.md`, `PLAN.md`, and `TASKS.md` exist and are linked |
| V040-002 | M0 | Update roadmap/index/architecture links | docs | P0 | V040-001 | planned | v0.4.0 docs are discoverable from top-level planning docs |
| V040-003 | M0 | Add package boundary expectations | test/build | P0 | V040-001 | planned | boundary test includes `protocol` and `runtime` target direction |
| V040-004 | M0 | Lock runtime/runner/sandbox/workflow terminology | docs | P0 | V040-001 | planned | docs define `runtime` as package/layer, `runner` as one-run executor, `sandbox/environment` as code execution environment, and `workflow` as outer orchestration |
| V040-005 | M0 | Lock small `agent` kernel boundary | docs/test | P0 | V040-001 | planned | docs and boundary expectations state that `agent` is public facade/kernel only, with runtime implementation moved out |
| V040-101 | M1 | Scaffold `packages/protocol` | build | P0 | V040-003 | planned | package has `package.json`, `src/index.ts`, and build wiring |
| V040-102 | M1 | Move model and phase contracts to protocol | protocol/agent/store | P0 | V040-101 | planned | `LlmPhase`, `ModelRef`, `ModelCallUsage` exported from protocol |
| V040-103 | M1 | Move tool contracts to protocol | protocol/agent/store | P0 | V040-101 | planned | `ToolCall`, `ToolResult` exported from protocol |
| V040-104 | M1 | Move turn contracts to protocol | protocol/store/agent | P0 | V040-102,V040-103 | planned | `ExecutionTurn`, `ExecutionTurnEntry`, `StepFilter` exported from protocol |
| V040-105 | M1 | Remove duplicate store/agent type definitions | agent/store | P0 | V040-104 | planned | store persists protocol types and no longer redefines shared contracts |
| V040-201 | M2 | Remove `context -> agent` type imports | context | P0 | V040-105 | planned | context imports only `protocol + session` for shared contracts |
| V040-202 | M2 | Preserve prompt rendering behavior | context/test | P0 | V040-201 | planned | existing prompt contamination tests pass unchanged |
| V040-301 | M3 | Scaffold `packages/runtime` | build/runtime | P0 | V040-003,V040-105 | planned | runtime package builds and exports an execution entrypoint |
| V040-302 | M3 | Define runtime ports/input shape | runtime/agent | P0 | V040-301 | planned | runtime can receive session, store, context builder, tools, MCP tool providers, hooks, model stream, and event emitter |
| V040-303 | M3 | Delegate `Agent.prompt()` through runtime boundary | agent/runtime | P0 | V040-302 | planned | public Agent behavior remains unchanged |
| V040-304 | M3 | Expose runtime runner naming | runtime | P1 | V040-301 | planned | runtime exports an `AgentRunner` / `runner.ts` entrypoint while package name remains `runtime` |
| V040-401 | M4 | Move route phase into runtime | runtime/agent | P0 | V040-303 | planned | direct/task/thread route tests pass |
| V040-402 | M4 | Move plan phase into runtime | runtime/agent | P0 | V040-401 | planned | planner output and schema tests pass |
| V040-403 | M4 | Move execute phase into runtime | runtime/agent | P0 | V040-402 | planned | text/tool call/tool result tests pass |
| V040-404 | M4 | Move verify phase into runtime | runtime/agent | P0 | V040-403 | planned | verify retry and outcome tests pass |
| V040-405 | M4 | Move scheduler and thread execution helpers | runtime/agent | P0 | V040-401 | planned | thread lifecycle tests pass through public Agent API |
| V040-406 | M4 | Move skills application, hooks, MCP ownership, and core tool execution | runtime/agent | P0 | V040-403 | planned | default workspace tools still work through CLI and MCP ownership is reserved under `runtime/mcp` |
| V040-407 | M4 | Move turn recording into runtime | runtime/store | P0 | V040-404 | planned | `ExecutionTurn` entries are recorded with protocol types |
| V040-408 | M4 | Trim `agent` to public facade/kernel | agent/runtime | P0 | V040-407 | planned | `agent` owns lifecycle/state/event fanout and optional type re-exports only; no phase workflow, task planner, verifier, tool runner, or turn recorder implementation remains |
| V040-501 | M5 | Update package boundary tests | test/build | P0 | V040-407 | planned | no reversed dependency from runtime to agent or context to agent |
| V040-502 | M5 | Update docs and examples | docs | P1 | V040-501 | planned | README/ROADMAP/ARCHITECTURE match shipped package boundaries |
| V040-503 | M5 | Run package tests | release | P0 | V040-501 | planned | `bun test packages` passes |
| V040-504 | M5 | Run build | release | P0 | V040-501 | planned | `bun run build` passes |
| V040-505 | M5 | Run CLI smoke tests | release | P0 | V040-503,V040-504 | planned | `bun run rowan "hello"` and session continuation pass |

## 4. Release Checklist

- [ ] v0.4.0 planning docs created and linked
- [ ] runtime/runner/sandbox/workflow terminology locked
- [ ] small `agent` kernel boundary locked
- [ ] `packages/protocol` scaffolded
- [ ] shared model/phase/tool/turn contracts moved to protocol
- [ ] duplicate store/agent shared contract definitions removed
- [ ] `context` no longer imports `agent`
- [ ] `packages/runtime` scaffolded
- [ ] runtime ports defined
- [ ] `Agent.prompt()` delegates through runtime
- [ ] route phase moved
- [ ] plan phase moved
- [ ] execute phase moved
- [ ] verify phase moved
- [ ] scheduler/thread helpers moved
- [ ] skills application, hooks, MCP ownership, and core tool execution moved
- [ ] turn recording moved
- [ ] `agent` trimmed to public facade/kernel
- [ ] package boundary tests updated
- [ ] `bun test packages`
- [ ] `bun run build`
- [ ] CLI smoke tests

## 5. Explicitly Out of v0.4.0

- [ ] provider-neutral `ConversationEntry[]`
- [ ] full context projection/rendering pipeline
- [ ] SSE streaming parser
- [ ] token budget truncation
- [ ] PolicyEngine
- [ ] full MCP server/client integration
- [ ] replay / fork / compaction
- [ ] workflow graph
- [ ] eval harness
