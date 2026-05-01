# Rowan v0.3.0 Task Board

> 版本：v0.3.0
> 日期：2026-05-01
> 状态：planning

## 1. Milestones

| Milestone | Goal |
|---|---|
| M0 | Version normalization and planning docs |
| M1 | Route-first task gating |
| M2 | Direct response outcome semantics |
| M3 | Sub Agent child run API |
| M4 | Nested trace and budget enforcement |
| M5 | Release verification |

## 2. Tasks

| ID | Milestone | Task | Type | Priority | Depends On | Status | Acceptance |
|---|---|---|---|---|---|---|---|
| V03-001 | M0 | Normalize docs version references to three-part versions | docs | P0 | - | done | Historical docs use `v0.0.0`, `v0.1.0`, `v0.2.0`; current docs use `v0.3.0` |
| V03-002 | M0 | Bump package versions to `0.3.0` | release | P0 | - | done | Root and workspace package manifests use `0.3.0` |
| V03-003 | M0 | Introduce `context` module for prompt assembly | context | P0 | V03-002 | done | prompt construction is owned by `@rowan-agent/context`; adapters consume assembled prompts |
| V03-101 | M1 | Add `route` LLM phase | agent | P0 | V03-001 | done | `LlmPhase` and prompts support route |
| V03-102 | M1 | Add task routing decision schema | agent | P0 | V03-101 | done | Model output parses `{ message, needsTask }` |
| V03-103 | M1 | Gate `task_created` behind `needsTask` | agent | P0 | V03-102 | done | direct response does not emit `task_created` |
| V03-104 | M1 | Add deterministic guardrail for explicit tool requests | agent | P0 | V03-102,V03-003 | done | agent scheduler upgrades explicit bash/tool/workspace requests after model routing; adapters preserve model decisions |
| V03-201 | M2 | Add direct response outcome path | agent | P0 | V03-103 | done | no-task output returns a passed outcome without `taskId` |
| V03-202 | M2 | Print CLI run output through a shared Outcome formatter | cli | P1 | V03-201 | done | direct and task responses both use `formatOutcomeOutput(outcome)` |
| V03-301 | M3 | Define `SubAgentInput` and child run types | agent | P0 | V03-201 | todo | public types compile and tests cover defaults |
| V03-302 | M3 | Implement parent-controlled sub Agent runner | agent | P0 | V03-301 | todo | parent can launch child run with explicit tools/skills |
| V03-401 | M4 | Record parent/child trace metadata | trace | P0 | V03-302 | todo | trace can associate child run with parent session |
| V03-402 | M4 | Enforce sub Agent budget | agent | P1 | V03-302 | todo | over-budget child run returns structured failed outcome |
| V03-501 | M5 | Run v0.3.0 release gates | release | P0 | V03-401,V03-402 | todo | `bun test` and `bun run build` pass |

## 3. Release Checklist

- [x] Version docs use three-part format
- [x] Package manifests use `0.3.0`
- [x] Route-first direct response test
- [x] Route-before-task tool request test
- [ ] Sub Agent child run tests
- [ ] Nested trace tests
- [ ] Budget enforcement tests
- [ ] Full test suite
- [ ] TypeScript build

## 4. Explicitly Out of v0.3.0

- [ ] multi-agent negotiation
- [ ] workflow DAG
- [ ] long-term memory
- [ ] provider-native tool calling
- [ ] UI
