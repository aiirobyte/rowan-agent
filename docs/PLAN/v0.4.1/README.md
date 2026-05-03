# Rowan v0.4.1 Agent Boundary Correction

> 版本：v0.4.1
> 日期：2026-05-03
> 状态：planned
> 计划：`docs/PLAN/v0.4.1/PLAN.md`
> 任务表：`docs/PLAN/v0.4.1/TASKS.md`

## Summary

v0.4.1 corrects the package boundary introduced in v0.4.0.

v0.4.0 successfully removed reversed dependencies and created `protocol` / `runtime`, but it also moved too much Agent definition into `runtime`. The core Agent loop, phase workflow, and thread semantics are Agent behavior, not runtime glue.

The next step is to make `packages/agent/src/agent.ts` the Agent core/facade entrypoint and move the current runtime-owned driver files into `packages/agent/src/`:

- `packages/runtime/src/loop.ts`
- `packages/runtime/src/thread.ts`
- `packages/runtime/src/phases/*`

No separate `core` package or `core/` folder will be introduced. There is also no external API compatibility requirement, so removed runtime exports do not need compatibility re-exports.

## Target Boundary

```text
agent
  -> Agent class and public facade
  -> Agent loop
  -> route / plan / execute / verify phases
  -> thread semantics
  -> task retry / verification / outcome rules
  -> exposes runtime hook/port interfaces

runtime
  -> local tool definitions and execution glue
  -> workspace path helpers
  -> skills loading
  -> hooks and policy integration point
  -> MCP tool-provider integration
  -> runtime adapters that plug into the Agent loop
```

## Why Now

v0.5.0 will add context projection and provider-neutral IR. That work should build on the corrected Agent/runtime boundary, otherwise context rendering and plugin hooks will inherit the wrong ownership model.
