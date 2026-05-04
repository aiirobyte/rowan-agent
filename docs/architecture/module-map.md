# Rowan Module Map

This map describes Rowan Modules by their current Interfaces, Implementations, Seams, and Depth pressure. It is intentionally compact so future architecture reviews can navigate the codebase quickly.

## Package Modules

| Module | Interface | Implementation | Current Depth |
|---|---|---|---|
| `packages/protocol` | Shared Rowan contracts: model, phase, task, tool, context, turn, validators | Type definitions and lightweight parsers | Deep for shared contracts, but phase output contracts are still incomplete |
| `packages/session` | Session, AgentMessage, Skill, ContextScope, persisted Session helpers | In-memory Session creation, message scoping, persisted conversation filtering | Deep for Session storage rules |
| `packages/store` | AgentStore with Session persistence plus ExecutionTurn append/load | In-memory and local JSON stores | Deep enough until replay/query pressure appears |
| `packages/context` | Prompt construction for route, plan, execute, verify | OpenAI-compatible chat message rendering and prompt templates | Shallow against future DCP needs because Projection and Rendering are not first-class yet |
| `packages/adapters` | Provider Adapter surface and OpenAI-compatible StreamFn | HTTP request handling, JSON extraction, provider output normalization | Deep for OpenAI-compatible HTTP, shallow at typed phase-output Seam |
| `packages/runtime` | Runtime glue: workspace helpers, tools, skills, hooks, MCP placeholder | Core local tools, skill loading, path helpers | Shallow at ToolRunner Seam because default execution still lives in `agent` |
| `packages/agent` | Agent facade and Agent loop | Session lifecycle, event fanout, route/plan/execute/verify, thread semantics, task attempts, effects, Outcomes | Deep as run owner, but `loop.ts` has absorbed provider and tool glue |
| `packages/logging` | AgentEvent log sinks | Console and Pino JSONL loggers with redaction | Deep for observability |
| `packages/cli` | `rowan` command entrypoint | Argument parsing, config, composition, logging, persistence, interactive loop | Shallow as a CLI Module because several workflows share one file |

## Intended Dependency Direction

```text
protocol    -> none
session     -> none
store       -> protocol, session
context     -> protocol, session
runtime     -> protocol, session
agent       -> protocol, session, store, runtime
adapters    -> protocol, context
logging     -> agent
cli         -> adapters, agent, logging, protocol, runtime, session, store
```

## Important Seams

**Provider Adapter Seam**:
`StreamFn` connects provider adapters to the Agent loop. This Seam should carry provider-independent, typed model output so `agent` does not repair provider JSON.

**ToolRunner Seam**:
Runtime glue should execute tool calls through an event-neutral ToolRunner. The Agent loop should translate ToolRunner outcomes into AgentEvents, Session messages, and ExecutionTurns.

**Context Rendering Seam**:
`packages/context` should own phase-specific Rendering. Future Projection should make phase viewports explicit before provider wire conversion.

**Store Seam**:
`AgentStore` persists Sessions and ExecutionTurns. It should remain storage-shaped and not own Agent loop semantics.

**Logging Seam**:
Logging observes AgentEvents. It should not become replay state.

## Current Shallow Signals

- `packages/agent/src/loop.ts` contains provider stream collection, tool execution, effect publication, and run ordering in one Implementation.
- `ModelStreamEvent` carries `structured_output: unknown`, even though adapters already know phase-specific output.
- Runtime hook and tool types are split between `agent` and `runtime`, so tool policy work has no single test surface.
- Context Rendering is still direct message scanning plus phase prompt construction, not an explicit DCP Projection and Rendering model.
- CLI composition and terminal interaction are coupled in one Module.
