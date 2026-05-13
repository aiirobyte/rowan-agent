# Rowan v0.4.3 Spec

Last updated: 2026-05-13
Status: Planned

## Version Goal

Consolidate `packages/agent/src/loop.ts` at the existing package boundaries before v0.5.0 context projection and provider IR work.

The intended shape is:

```text
agent keeps Agent driver semantics and ordered state-machine behavior
protocol / adapters / runtime / context own their existing boundary responsibilities
```

This is not a feature release. It is an architecture-hardening release whose value is a smaller, clearer Agent loop without moving Agent semantics into the wrong package.

## Why This Version Exists

v0.4.2 made phase input/output shapes explicit, but `packages/agent/src/loop.ts` still carries cross-package glue:

- provider output parsing and structured-output repair;
- tool lookup, argument validation, execution, and hook dispatch;
- phase orchestration;
- task attempts and verification;
- thread route execution;
- outcome and error finalization.

Splitting this into many Agent-local files would reduce one file's size without fixing ownership. v0.4.3 should move provider normalization toward `adapters`, tool execution toward `runtime`, shared contracts toward `protocol`, and prompt/context rendering toward `context`, while keeping Agent-owned control flow in `agent`.

## Core Behavior

- Shared phase output contracts are importable from `protocol` when more than one package needs them.
- Provider-specific JSON/text/tool-call normalization remains in `adapters`.
- Runtime-owned tool execution is event-neutral and returns structured outcomes instead of emitting `AgentEvent`s directly.
- `runAgentLoop()` remains in `packages/agent/src/loop.ts`.
- `agent` translates model/tool outcomes into Agent events, session effects, execution turns, attempts, verification, thread depth, and final `AgentRunResult`.
- `agent` does not import `adapters`.
- `runtime` does not own route / plan / execute / verify ordering.

## Scope

### In Scope

- Move shared phase output aliases or equivalent contracts into `protocol`.
- Add a typed phase-output stream event or equivalent cross-package contract.
- Preserve current `StreamFn` tests during migration where a direct replacement would be too disruptive.
- Update OpenAI-compatible adapter behavior and tests around typed phase outputs.
- Add runtime-owned tool execution primitives.
- Move default tool argument validation and before/after hook handling out of `agent/src/loop.ts`.
- Cache compiled tool parameter validators if the runtime primitive compiles schemas.
- Update Agent loop code to consume typed adapter output and runtime tool execution.
- Update package boundary tests and focused behavior tests.
- Update README and architecture docs after implementation.

### Out Of Scope

- No full context projection or provider-neutral `ConversationEntry[]`.
- No new policy engine.
- No full MCP server/client behavior.
- No replay, fork, or compaction.
- No workflow graph.
- No public API stabilization.
- No package version bump until implementation is complete.
- No new `packages/agent/src/runtime.ts`.
- No new `packages/agent/src/model-stream.ts`.

## Architecture

Target ownership:

```text
protocol
  -> shared phase IO and stream event contracts

adapters
  -> provider output normalization into typed Rowan stream events

runtime
  -> event-neutral tool execution primitives, hooks, schema validation,
     workspace/MCP/plugin glue

context
  -> prompt construction and phase-readable context rendering

agent
  -> session lifecycle, AgentEvents, ExecutionTurn materialization,
     route / direct / task / thread ordering, attempts, verification, outcomes
```

Target flow:

```text
Agent.prompt()
  -> runAgentLoop()
  -> route phase
       adapter-normalized phase output
       agent records phase effects
  -> direct | thread | task
  -> plan phase
       adapter-normalized task output
  -> attempt loop
       execute phase returns text/tool calls
       runtime executes tool calls through event-neutral primitive
       agent appends tool results and emits events
       verify phase returns typed verification output
  -> outcome
```

The key distinction:

```text
adapters normalize model/provider output
runtime executes tools
agent orders the run and publishes effects
```

## Testing

Required verification:

```bash
bun test packages
bun run build
```

Focused tests should cover:

- Shared phase output contracts are importable without depending on `agent`.
- Adapter tests assert typed phase output events for route, plan, execute, and verify paths.
- Invalid provider output still surfaces useful adapter-owned error codes/details.
- Runtime tool execution handles unknown tools, invalid args, blocked calls, successful calls, and after-hook results.
- Tool approval/review hook behavior matches v0.4.2.
- Agent behavior tests still cover direct answer, task, thread, multi-turn, limits, invalid schema, invalid tool args, and verify retry paths.
- Package boundary tests prevent `agent -> adapters`.

## Acceptance

- `docs/version/0.4.3/` contains this spec, a prompt plan, and a todo file.
- Agent loop no longer owns provider JSON repair or normalization as the primary path.
- Default tool execution uses runtime-owned execution primitives.
- `runAgentLoop()` still visibly owns route / branch / plan / attempt execute / verify / outcome ordering.
- `agent` does not import `adapters`.
- `runtime` does not own route / plan / execute / verify ordering.
- No new `packages/agent/src/runtime.ts` or `packages/agent/src/model-stream.ts`.
- Package boundary tests pass.
- Direct, task, thread, multi-turn, limits, invalid schema, invalid tool args, and verify retry tests pass.
- `bun test packages` passes.
- `bun run build` passes.
