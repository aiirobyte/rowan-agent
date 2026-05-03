# Rowan v0.3.4 Task Board

> 版本：v0.3.4
> 日期：2026-05-03
> 状态：implemented

## 1. Milestones

| Milestone | Goal |
|---|---|
| M0 | Planning |
| M1 | Store package scaffold |
| M2 | Type and implementation move |
| M3 | Consumer rewiring |
| M4 | Boundary and release verification |

## 2. Tasks

| ID | Milestone | Task | Type | Priority | Depends On | Status | Acceptance |
|---|---|---|---|---|---|---|---|
| V034-001 | M0 | Add v0.3.4 planning docs | docs | P0 | - | done | `PLAN.md`, `TASKS.md`, `README.md` exist and roadmap/index link to them |
| V034-101 | M1 | Create `packages/store` | package | P0 | V034-001 | done | Package has `package.json`, `src/index.ts`, and TypeScript exports |
| V034-201 | M2 | Move store types from agent to store | store/agent | P0 | V034-101 | done | `ExecutionTurn`, `StepFilter`, `AgentStore`, schemas exported by `@rowan-agent/store` |
| V034-202 | M2 | Move `InMemoryAgentStore` to store | store/test | P0 | V034-201 | done | Agent tests import in-memory store from `@rowan-agent/store` |
| V034-203 | M2 | Move `LocalJsonAgentStore` to store | store/cli | P0 | V034-201 | done | CLI imports JSON store from `@rowan-agent/store` |
| V034-301 | M3 | Rewire agent imports | agent | P0 | V034-201 | done | Agent code imports store types from `@rowan-agent/store` |
| V034-302 | M3 | Rewire CLI imports | cli | P0 | V034-203 | done | CLI has no storage implementation ownership |
| V034-303 | M3 | Rewire tests | test | P0 | V034-202,V034-203 | done | Tests import stores from `@rowan-agent/store` |
| V034-401 | M4 | Update package boundary test | test | P0 | V034-301,V034-302 | done | Boundary rules include `store` and reject `store -> agent` |
| V034-402 | M4 | Run release gates | release | P0 | V034-401 | done | `bun test packages` and `bun run build` pass |

## 3. Release Checklist

- [x] `packages/store` exists
- [x] store package exports `AgentStore`
- [x] store package exports `ExecutionTurn`
- [x] store package exports `InMemoryAgentStore`
- [x] store package exports `LocalJsonAgentStore`
- [x] `agent` no longer owns `src/store.ts`
- [x] `cli` no longer owns local JSON store implementation
- [x] package boundary test includes `store`
- [x] `bun test packages`
- [x] `bun run build`

## 4. Explicitly Out of v0.3.4

- [ ] `packages/protocol`
- [ ] `packages/store-json`
- [ ] `RenderedAgentContext`
- [ ] provider IR
- [ ] DB / SQLite
- [ ] legacy session migration
