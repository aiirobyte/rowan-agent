# Rowan v0.4.2 Agent Loop IO Atomization

> 版本：v0.4.2
> 日期：2026-05-03
> 状态：implemented
> 计划：`docs/PLAN/v0.4.2/PLAN.md`
> 任务表：`docs/PLAN/v0.4.2/TASKS.md`

## Summary

v0.4.2 turns the corrected v0.4.1 Agent/runtime boundary into concrete loop architecture.

The Agent loop remains Agent-owned: it controls route / direct / task / thread branching, attempts, verification, thread semantics, and final outcomes. Runtime becomes an explicit participant through narrow ports that can adjust each phase's input and output.

The goal is not to add new user-visible behavior. The goal is to make the loop internally composable:

```text
PhaseInput
  -> runtime.beforePhase()
  -> Agent-owned phase runner
  -> runtime.afterPhase()
  -> PhaseOutput
```

## Boundary Lock

```text
agent
  -> loop state machine
  -> typed phase inputs and outputs
  -> retry / verification / thread / outcome semantics

runtime
  -> phase IO adjustment ports
  -> ToolRunner integration point
  -> tools, hooks, MCP, policy, plugins, workspace helpers
```

## Why Now

Context projection/provider IR needs deterministic phase viewports. Tool policy needs a single execution path. Both are awkward while `loop.ts` passes one mutable runtime object everywhere. v0.4.2 cuts that knot first, then v0.5.0 and v0.6.0 can build on cleaner contracts.
