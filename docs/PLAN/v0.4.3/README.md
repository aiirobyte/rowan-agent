# Rowan v0.4.3 Agent Loop Package Boundary Consolidation

> 版本：v0.4.3
> 日期：2026-05-04
> 状态：planned
> 计划：`docs/PLAN/v0.4.3/PLAN.md`
> 任务表：`docs/PLAN/v0.4.3/TASKS.md`
> 架构候选：`docs/architecture/deepening-opportunities.md`

## Summary

v0.4.3 is a boundary-consolidation release before v0.5.0 context projection.

The immediate problem is that `packages/agent/src/loop.ts` is still too large and carries responsibilities that already have package homes. The fix is not to split the Agent package into many new internal files. The fix is to move cross-package responsibilities back to the existing package boundaries and leave `agent` with a smaller orchestration loop.

## Boundary Lock

```text
protocol
  -> shared phase IO and stream event contracts

adapters
  -> provider output normalization into typed Rowan stream events

runtime
  -> event-neutral tool execution primitives, hooks, schema validation, workspace/MCP/plugin glue

context
  -> prompt construction and phase-readable context rendering

agent
  -> session lifecycle, AgentEvents, ExecutionTurn materialization,
     route / direct / task / thread ordering, attempts, verification, outcomes
```

## Non-Goals

- Do not create `packages/agent/src/runtime.ts`.
- Do not create `packages/agent/src/model-stream.ts`.
- Do not make `agent` import `adapters`.
- Do not move route / plan / execute / verify ordering into `runtime`.
- Do not start v0.5.0 context projection in this release.

## Why Now

v0.4.2 made phase IO explicit, but the low-level loop still owns too much glue. v0.4.3 makes the package architecture match the loop architecture before context projection and provider IR work begins.

For the architecture-review source of this release, read `CONTEXT.md`, `docs/adr/`, and `docs/architecture/deepening-opportunities.md` before changing the task board.
