# Rowan Module Map

This map describes Rowan Modules by their current Interfaces, Implementations, Seams, and Depth pressure. It is intentionally compact so future architecture reviews can navigate the codebase quickly.

## Package Modules

| Module | Interface | Implementation | Current Depth |
|---|---|---|---|
| `packages/protocol` | Shared Rowan contracts: model, phase, typed phase output, task, tool, context, turn, validators | Type definitions and lightweight parsers | Deep for shared contracts |
| `packages/session` | Session, AgentMessage, Skill, ContextScope, persisted Session helpers | In-memory Session creation, message scoping, persisted conversation filtering | Deep for Session storage rules |
| `packages/store` | AgentStore with Session persistence plus ExecutionTurn append/load | In-memory and local JSON stores | Deep enough until replay/query pressure appears |
| `packages/context` | Prompt construction for route, plan, execute, verify | OpenAI-compatible chat message rendering and prompt templates | Shallow against future DCP needs because Projection and Rendering are not first-class yet |
| `packages/adapters` | Provider Adapter surface and OpenAI-compatible StreamFn | HTTP request handling, JSON extraction, typed phase-output normalization | Deep for OpenAI-compatible HTTP and provider output normalization |
| `packages/runtime` | Runtime glue: workspace helpers, tools, event-neutral tool execution, skills, hooks, planned MCP placeholder | Core local tools, tool execution primitive, skill loading, path helpers, hook/MCP seams | Deeper after v0.4.3; future policy/MCP can reuse the tool execution primitive |
| `packages/agent` | Agent facade and Agent loop | Session lifecycle, event fanout, route/plan/execute/verify, thread semantics, task attempts, effects, Outcomes | Deep as run owner; still large, but provider output and default tool execution are now package-owned elsewhere |
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
`StreamFn` connects provider adapters to the Agent loop. This Seam now carries typed `phase_output` events so `agent` can consume provider-independent model output without owning provider JSON repair.

**ToolRunner Seam**:
Runtime glue executes default tool calls through an event-neutral primitive. The Agent loop translates runtime observations and outcomes into AgentEvents, Session messages, and ExecutionTurns.

**Context Rendering Seam**:
`packages/context` should own phase-specific Rendering. Future Projection should make phase viewports explicit before provider wire conversion.

**Store Seam**:
`AgentStore` persists Sessions and ExecutionTurns. It should remain storage-shaped and not own Agent loop semantics.

**Logging Seam**:
Logging observes AgentEvents. It should not become replay state.

## Current Shallow Signals

- `packages/agent/src/loop.ts` still contains phase stream collection, effect publication, and run ordering in one Implementation.
- `structured_output: unknown` remains as a compatibility stream event for local scripted streams, but adapter-owned output now uses typed `phase_output`.
- Tool policy work still needs richer before/after context and result contracts, but default tool execution now has a runtime-owned test surface.
- Context Rendering is still direct message scanning plus phase prompt construction, not an explicit DCP Projection and Rendering model.
- CLI composition and terminal interaction are coupled in one Module.
