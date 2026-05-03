# Rowan v0.3.4 Task Board

> 版本：v0.3.4
> 日期：2026-05-03
> 状态：planned

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
| V034-001 | M0 | Add v0.3.4 planning docs | docs | P0 | - | planned | `PLAN.md`, `TASKS.md`, `README.md` exist and roadmap/index link to them |
| V034-101 | M1 | Create `packages/store` | package | P0 | V034-001 | planned | Package has `package.json`, `src/index.ts`, and TypeScript exports |
| V034-201 | M2 | Move store types from agent to store | store/agent | P0 | V034-101 | planned | `ExecutionTurn`, `StepFilter`, `AgentStore`, schemas exported by `@rowan-agent/store` |
| V034-202 | M2 | Move `InMemoryAgentStore` to store | store/test | P0 | V034-201 | planned | Agent tests import in-memory store from `@rowan-agent/store` |
| V034-203 | M2 | Move `LocalJsonAgentStore` to store | store/cli | P0 | V034-201 | planned | CLI imports JSON store from `@rowan-agent/store` |
| V034-301 | M3 | Rewire agent imports | agent | P0 | V034-201 | planned | Agent code imports store types from `@rowan-agent/store` |
| V034-302 | M3 | Rewire CLI imports | cli | P0 | V034-203 | planned | CLI has no storage implementation ownership |
| V034-303 | M3 | Rewire tests | test | P0 | V034-202,V034-203 | planned | Tests import stores from `@rowan-agent/store` |
| V034-401 | M4 | Update package boundary test | test | P0 | V034-301,V034-302 | planned | Boundary rules include `store` and reject `store -> agent` |
| V034-402 | M4 | Run release gates | release | P0 | V034-401 | planned | `bun test packages` and `bun run build` pass |

## 3. Release Checklist

- [ ] `packages/store` exists
- [ ] store package exports `AgentStore`
- [ ] store package exports `ExecutionTurn`
- [ ] store package exports `InMemoryAgentStore`
- [ ] store package exports `LocalJsonAgentStore`
- [ ] `agent` no longer owns `src/store.ts`
- [ ] `cli` no longer owns local JSON store implementation
- [ ] package boundary test includes `store`
- [ ] `bun test packages`
- [ ] `bun run build`

## 4. Explicitly Out of v0.3.4

- [ ] `packages/protocol`
- [ ] `packages/store-json`
- [ ] `RenderedAgentContext`
- [ ] provider IR
- [ ] DB / SQLite
- [ ] legacy session migration
