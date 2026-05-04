# Rowan Agent Technical Architecture

> 版本：v0.4.3
> 日期：2026-05-04
> 状态：planned
> 进度：v0.0.0 到 v0.4.2 已实现；v0.4.3 先收敛 Agent loop 包边界，v0.5.0+ 进入 context projection/provider IR
> 输入文档：`CONTEXT.md`、`docs/architecture/module-map.md`、`docs/adr/`、`docs/PLAN/ROADMAP.md`、`docs/PLAN/v0.0.0/PLAN.md`、`docs/PLAN/v0.1.0/PLAN.md`、`docs/PLAN/v0.2.0/PLAN.md`、`docs/PLAN/v0.3.0/PLAN.md`、`docs/PLAN/v0.3.1/PLAN.md`、`docs/PLAN/v0.3.2/PLAN.md`、`docs/PLAN/v0.3.3/PLAN.md`、`docs/PLAN/v0.3.4/PLAN.md`、`docs/PLAN/v0.3.5/PLAN.md`、`docs/PLAN/v0.4.0/PLAN.md`、`docs/PLAN/v0.4.1/PLAN.md`、`docs/PLAN/v0.4.2/PLAN.md`、`docs/PLAN/v0.4.3/PLAN.md`

Architecture review entrypoints:

- `CONTEXT.md` defines Rowan domain language.
- `docs/adr/` records accepted architecture decisions.
- `docs/architecture/module-map.md` describes current Modules, Interfaces, Implementations, and Seams.
- `docs/architecture/deepening-opportunities.md` records candidate deepening opportunities.

## 1. Architecture Goal

Rowan 是一个面向工程化 Agent 的 Bun + TypeScript harness runtime。当前内核已经跑通：

```text
Session
  -> Agent
  -> route / plan / execute / verify
  -> Tool calls
  -> Outcome
  -> AgentStore steps
  -> Pino run log
```

v0.4.0+ 的架构方向是把现有边界升级成更清晰的 DCP-style pipeline：

```text
source input
  -> Adaptation: CanonicalAgentEvent
  -> Projection: IntermediateAgentContext
  -> Rendering: RenderedAgentContext / ConversationEntry[]
  -> Agent core: Agent facade + orchestration-only loop + route / plan / execute / verify + thread semantics
  -> Ports: phase IO hooks / ModelClient / ToolRunner / AgentStore / EventLogger
  -> Runtime glue: local tools / skills / hooks / MCP / plugins / workspace helpers
  -> Adapters: OpenAI-compatible / JSON store / Pino log
```

DCP 在这里指 deterministic context pipeline：外部输入、模型/工具运行结果、上下文渲染策略彼此分层，避免内部运行噪声污染未来 prompt。

## 2. Version Baseline

| Version | Status | Implemented architecture change |
|---|---|---|
| v0.0.0 | implemented | Minimal Agent kernel: `Session`、`Agent`、`Task`、`Tool`、同模型 verifier、`Outcome`、`AgentEvent` |
| v0.1.0 | implemented | OpenAI-compatible Chat Completions runtime via `StreamFn` |
| v0.2.0 | implemented | Monorepo foundation and workspace core tools seed |
| v0.3.0 | implemented | route-first execution: direct / task / thread predecessor path |
| v0.3.1 | implemented | Persistent multi-turn `Session` and CLI session continuation |
| v0.3.2 | implemented | Thread unification with `parentSessionId`, `task`, `goal`; old predecessor API removed |
| v0.3.3 | implemented | `AgentStore` port, `ExecutionTurn`, scoped context, JSON session+steps |
| v0.3.4 | implemented | `packages/store` consolidation and store/package boundary cleanup |
| v0.3.5 | implemented | `packages/logging`, Pino run logs, removal of self-owned trace package |
| v0.4.0 | implemented | `packages/protocol`, runtime-owned execution mechanics, context import cleanup, small `agent` facade |
| v0.4.1 | implemented | Corrected v0.4.0 over-move: Agent-owned loop/thread/phases/task outcomes/turn recording, runtime as glue/integration, no `core/` folder, no runtime compatibility re-exports |
| v0.4.2 | implemented | Agent loop IO atomization: typed phase inputs/outputs, runtime phase ports, orchestration-only loop |
| v0.4.3 | planned | Agent loop package-boundary consolidation: protocol shared phase output contracts, adapter-owned provider output normalization, runtime-owned tool execution primitive, Agent-owned orchestration/effects/outcomes |

## 3. Current Package Architecture

Current tracked package layout:

```text
packages/
  protocol/  Zero-dependency shared contracts: model, phase, tool, task, context, turn
  session/    Session, AgentMessage, Skill, ContextScope, persisted session helpers
  store/      AgentStore port, protocol ExecutionTurn persistence, in-memory/json stores
  runtime/    Runtime glue: tools, skills, hooks, MCP boundary, workspace helpers, runtime integration types
  agent/      Public facade plus Agent core: Agent, state/lifecycle, event fanout, abort/waitForIdle, loop/thread/phases/task outcomes/turn recording
  context/    phase prompt templates and OpenAI-compatible prompt builder
  adapters/   OpenAI-compatible provider adapter and JSON extraction
  logging/    Pino AgentEvent logger and redaction
  cli/        composition root for model, tools, store, logging, skills, output
```

Current dependency direction:

```text
protocol     -> none
session      -> none
store        -> protocol, session
context      -> protocol
runtime      -> protocol, session
agent        -> protocol, runtime, session, store
adapters     -> protocol, context
logging      -> agent
cli          -> adapters, agent, logging, runtime, session, store
```

v0.4.0 resolved the v0.3.5 dependency pressure points:

- `agent` no longer imports `ExecutionTurn` / `ExecutionTurnEntry` from `store`.
- `context` imports protocol-shaped context/tool contracts instead of importing `agent`.
- `store` validates and persists protocol turn types instead of owning shared model/tool/phase contracts.
- v0.4.0 moved the execution loop, thread runner, scheduler, tools, hooks/MCP boundary, skills loading, and turn recording into `runtime`.
- v0.4.0 left `agent` as a public facade/kernel delegating execution to `runtime`.

v0.4.1 corrects the over-move from v0.4.0:

- `agent` now owns the Agent loop, route / plan / execute / verify phases, thread semantics, retry rules, verification rules, outcome creation, and turn recording.
- `runtime` now owns runtime glue: workspace helpers, tools, skills loading, hooks/policy integration, MCP tool providers, and future plugin integration points.
- No new `packages/agent-core` or `packages/agent/src/core/` is introduced; `packages/agent/src/agent.ts` remains the Agent core/facade entrypoint.
- Removed runtime loop/thread/phase exports do not need compatibility re-exports because the package surface is not externally stable yet.

v0.4.3 applies that ownership to the remaining loop complexity:

- `protocol` exposes shared phase output and stream event contracts where multiple packages need them.
- `adapters` own provider output normalization into typed Rowan stream events.
- `runtime` owns event-neutral tool execution primitives, argument validation, hook invocation, and schema validator caching.
- `agent` translates model/tool results into AgentEvents, session effects, ExecutionTurns, attempts, verification, thread depth, and outcomes.
- Agent loop cleanup should not create new Agent-local `runtime.ts` or `model-stream.ts` substitutes.

## 4. Core Data Boundaries

### 4.1 Session

Current `Session`:

```ts
interface Session<TLogEvent = never> {
  version: string;
  id: string;
  parentSessionId?: string;
  systemPrompt: string;
  input: string;
  task?: string;
  goal?: string;
  messages: AgentMessage[];
  log: TLogEvent[];
  skills: Skill[];
  createdAt: string;
  updatedAt: string;
  title?: string;
}
```

Rules:

- `input` is the original session input and is not rewritten by later turns.
- `task` and `goal` describe worker thread context.
- `messages` should contain semantic user-visible conversation only.
- `log` is runtime event history and is not the persistent source of conversation truth.

### 4.2 Context Scope

Current `AgentMessage.metadata.scope` is the visibility boundary:

```ts
type ContextScope = "conversation" | "execution" | "diagnostic";
```

Rules:

| Scope | Meaning | Prompt visibility |
|---|---|---|
| `conversation` | user-visible semantic conversation | eligible for future route/plan context |
| `execution` | phase prompts, routing decisions, planner output, tool results | current run / stored steps only |
| `diagnostic` | errors, limits failures, invalid model output | trace/debug only |

Do not add a parallel `visibility` field. Future work should strengthen `scope` semantics instead.

### 4.3 ExecutionTurn

Current `ExecutionTurn` stores phase-level driver history:

```ts
type ExecutionTurn = {
  id: string;
  sessionId: string;
  parentSessionId?: string;
  phase: "route" | "plan" | "execute" | "verify";
  requestedAtMs: number;
  completedAtMs: number;
  model: ModelRef;
  usage?: ModelCallUsage;
  scope: ContextScope;
  entries: ExecutionTurnEntry[];
};
```

Rules:

- route decision, planner output, execute tool calls, tool results, and verifier output belong here.
- direct answer and accepted final outcome are explicitly published back into `session.messages` as `conversation`.
- failed outcomes stay out of future semantic context unless a later product decision explicitly publishes them.
- run logs observe events; `ExecutionTurn` is the replay/fork seed.

## 5. Current Agent Flow

```text
Agent.prompt(input)
  -> create/append Session user turn
  -> runAgentLoop() # v0.4.1 target: packages/agent/src/loop.ts
    -> routeRequest()
       -> route=direct: publish assistant conversation message, emit outcome
       -> route=task: planTask()
       -> route=thread: run child Session via the same Agent loop, then verify parent outcome
    -> executeTask()
       -> collect assistant text, tool calls, tool results
    -> verifyTask()
       -> decide pass/fail against acceptance criteria
    -> record ExecutionTurn for each phase
    -> emit AgentEvent stream
  -> AgentStore.save(session)
  -> logging subscriber writes Pino JSONL run log
```

The public API stays intentionally small:

```ts
class Agent {
  prompt(input: string): Promise<AgentRunResult>;
  abort(reason?: string): void;
  waitForIdle(): Promise<void>;
  subscribe(listener: AgentEventListener): Unsubscribe;
}
```

### 5.1 v0.4.2 Target Agent Loop Boundary

v0.4.2 keeps the Agent loop in `packages/agent`, but changes its internal shape. The loop should read like an ordered chain and stop passing the whole mutable runtime object into every helper.

Target ownership:

```text
agent
  -> AgentLoopConfig
  -> AgentRunState
  -> AgentContext
  -> PhaseInputMap / PhaseOutputMap
  -> runPhase() orchestration
  -> route / plan / execute / verify ordering
  -> attempts, thread branching, verification branching, outcome publishing

runtime
  -> AgentRuntimePort implementation
  -> beforePhase / afterPhase input-output adjustments
  -> ToolRunner port implementation
  -> policy, MCP, plugin, workspace integration
```

The phase runner contract is:

```text
PhaseInput
  -> runtime.beforePhase()
  -> Agent-owned phase runner
  -> runtime.afterPhase()
  -> PhaseOutput
```

Rules:

- phase helpers accept only their typed phase input, not the whole loop runtime;
- runtime hooks may return adjusted input/output, skip, retry, or abort outcomes through explicit result objects;
- session messages, AgentEvents, and ExecutionTurns are written through Agent-owned effect helpers;
- tool execution is reachable through a runtime-owned `ToolRunner` port, but task retry and verification stay Agent-owned.

### 5.2 v0.4.3 Package-Boundary Consolidation

v0.4.3 keeps the v0.4.2 ordered loop shape, but moves remaining cross-package glue out of the loop.

Target ownership:

```text
protocol
  -> PhaseOutput contracts and typed stream-event contracts

adapters
  -> provider response parsing, JSON extraction, schema normalization, typed phase output events

runtime
  -> tool lookup, argument validation, before/after hook pipeline, validator cache, event-neutral tool execution

agent
  -> run lifecycle, session effects, AgentEvents, ExecutionTurns,
     route/thread/task branching, attempts, verification, outcomes
```

Rules:

- `agent` must not import `adapters`;
- `runtime` must not own route / plan / execute / verify ordering;
- provider JSON repair belongs in `adapters`, not `agent`;
- default tool execution belongs in `runtime`, while event publication remains in `agent`;
- loop cleanup should reuse existing package surfaces instead of adding many Agent-local files.

## 6. Current Context Rendering

Current prompt building is still transitional:

```text
LlmContext
  -> prompt-builder filters session.messages by scope
  -> build phase prompt string
  -> OpenAI-compatible ChatMessage[]
```

This already prevents the most dangerous contamination cases:

- phase prompts are not replayed as conversation.
- routing decisions are not fed into later route prompts.
- failed outcomes are not published into conversation by default.
- tool results do not enter route/plan unless explicitly carried by phase context.

But the implementation still lacks a first-class projection/rendering model. The next architecture step is:

```text
Session + source events + driver turns
  -> IntermediateAgentContext
  -> RenderedAgentContext
  -> ConversationEntry[]
  -> provider adapter wire format
```

## 7. Target Package Architecture

The next stable package target is:

```text
packages/
  protocol/        zero-dependency shared contracts: phase, model, tool, task, event, turn
  session/         Session aggregate, source events, persisted session migration
  context/         projection, phase policies, rendering, prompt templates, ConversationEntry IR
  agent/           public Agent facade plus Agent core: lifecycle, state, event fanout, loop, phases, thread semantics
  runtime/         runtime glue: tools, skills, workspace helpers, hooks/policy integration, MCP, plugins
  adapters/        provider wire adapters
  store/           AgentStore implementations
  logging/         AgentEvent log sinks
  cli/             composition root
```

Target dependency direction after v0.4.1:

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

The key correction is that `context` should be an upstream input-rendering package, not an `agent` downstream package. After `protocol` exists, `context` may use protocol contracts and session state, but it should not import the public `Agent` facade or runtime implementation details.

The corrected minimal path before v0.5.0:

- create `protocol` first;
- keep `agent` as the public facade plus Agent core;
- move route / plan / execute / verify, scheduler, thread semantics, retry rules, verification rules, and outcome creation into `packages/agent/src/`;
- do not create `packages/agent-core` or `packages/agent/src/core/`;
- keep `runtime` as the glue/integration package for workspace helpers, local tools, skills, hooks/policy integration, MCP tool providers, and plugins;
- allow `agent` to re-export ergonomic public kernel contracts such as `AgentMessage`, `ToolCall`, `ToolResult`, `StreamFn`, and `AgentEvent`, but do not let `agent` own shared domain types; definitions live in `protocol` / `session`.

Terminology lock:

```text
agent core = Agent-owned loop, phases, thread semantics, retry, verification, and outcome rules; implemented directly under packages/agent/src/
runtime = integration/glue layer for tools, skills, hooks, MCP, plugins, policy, and workspace helpers
runner = optional internal helper only when it adds value beyond a direct runAgentLoop() call
sandbox/environment = tool or code execution environment
workflow = outer orchestration layer around Agent runs
```

MCP belongs inside `packages/runtime`, not a sibling package. MCP tools should enter Rowan as a `ToolProvider` / `ToolRunner` source and should be rendered to models through the same tool descriptor path as local tools.

Future package responsibilities:

```text
agent
  -> Agent class and public API
  -> Agent core/facade entrypoint in packages/agent/src/agent.ts
  -> AgentState
  -> Session create/load/save lifecycle
  -> user turn append and child thread lifecycle
  -> event subscription/fanout
  -> abort / waitForIdle
  -> runAgentLoop implementation
  -> route / plan / execute / verify phases
  -> thread semantics
  -> routing scheduler
  -> task retry, verification, and outcome rules
  -> DriverTurn assembly when it is core driver vocabulary
  -> does not own tool implementation, MCP integration, provider wire conversion, or workflow graph orchestration

runtime
  -> runtime glue/integration used by Agent core
  -> workspace helpers
  -> skill loading and runtime skill integration
  -> tool registry and tool runner
  -> core tool definitions and tool execution
  -> hook pipeline and policy hook invocation
  -> MCP client/tool provider implementation
  -> plugin integration points
  -> AgentStore / logging adapters when used as runtime composition
```

## 8. DCP Refactor Principles

1. `session.messages` only stores semantic conversation.
2. `ExecutionTurn` moves from `store` to `protocol`; `store` persists it but does not own the domain type.
3. `context` owns projection and rendering, not provider wire format, and depends on `protocol + session` rather than `agent`.
4. `adapters` convert `ConversationEntry[]` to provider requests and provider responses back to Rowan events/output.
5. `agent` owns route / plan / execute / verify, routing, thread semantics, retry, verification, and outcome rules.
6. `runtime` owns tools, skills, hooks, MCP tool providers, policy/plugin integration points, and workspace helpers.
7. Source input and Driver output remain orthogonal streams and are merged only by phase-specific rendering.
8. Filtering happens before compaction; never summarize internal execution noise into long-term context.
9. The Agent loop owns ordering, not hidden shared IO; each phase consumes typed input and returns typed output.
10. Runtime may transform phase IO through ports, but must not own the loop state machine.
11. Agent loop simplification should use existing package boundaries before adding new Agent-local helper files.

## 9. Planned Refactor Sequence

### Phase A: Protocol Boundary

Goal: remove reversed dependency between runtime kernel and storage.

Tasks:

- create `packages/protocol`;
- move `LlmPhase`, `ModelRef`, `ModelCallUsage`, `ToolCall`, `ToolResult`, `ExecutionTurn`, `ExecutionTurnEntry`, and `StepFilter` into `protocol`;
- update `agent`, `store`, `context`, `adapters`, and `logging` imports;
- update package boundary tests.

Acceptance:

- `agent` no longer imports `store` for execution step types;
- `store` persists protocol types but does not define them;
- `bun test packages` and `bun run build` pass.

### Phase B: Agent Boundary Correction

Goal: correct the v0.4.0 over-move by returning Agent driver semantics to `agent` while keeping runtime as integration glue.

Target shape:

```text
packages/agent/src/
  agent.ts
  loop.ts
  phases/index.ts
  phases/types.ts
  phases/routing.ts
  phases/verifying.ts
  recorder.ts # if driver-turn assembly remains core-owned

packages/runtime/src/
  index.ts
  dir.ts
  hooks/
  mcp/
  skills.ts
  tools.ts
```

Acceptance:

- public `Agent.prompt()` behavior stays unchanged;
- route, plan, execute, verify, thread semantics, retry, and outcome rules are Agent-owned under `packages/agent/src/`;
- `packages/agent/src/agent.ts` remains the Agent core/facade entrypoint; no `core/` folder or package is created;
- obsolete runtime loop/thread/phase/runner exports are removed without compatibility re-exports;
- core tools, hooks, skills, workspace helpers, and MCP tool-provider boundaries remain exported from `runtime`;
- limits, thread, verify retry, and multi-turn tests still pass.

### Phase C: Agent Loop IO Atomization

Goal: make `runAgentLoop()` orchestration-only by giving every phase a typed input and output, with runtime participation through explicit ports.

Target shape:

```text
packages/agent/src/
  loop.ts             # ordered state machine and outcome flow
  phases/types.ts     # AgentLoopConfig, AgentRunState, AgentContext, phase IO maps/results
  phases/runner.ts    # runPhase() before/after runtime port wrapper
  phases/routing.ts   # route scheduler helpers
  phases/verifying.ts # verifier helper

packages/runtime/src/
  types.ts            # ToolRunner and runtime integration contracts
```

Acceptance:

- no phase helper receives the whole mutable loop runtime;
- runtime can adjust phase input/output via `beforePhase` / `afterPhase`;
- `runAgentLoop()` visibly owns route / branch / plan / attempt execute / verify / outcome ordering;
- tool execution can be routed through a runtime-owned `ToolRunner` port without moving task retry semantics into runtime;
- direct, task, thread, limits, and verify retry tests still pass.

### Phase C2: Agent Loop Package-Boundary Consolidation

Goal: reduce `loop.ts` complexity by moving remaining cross-package glue to `protocol`, `adapters`, and `runtime` without changing Agent-owned ordering.

Target shape:

```text
packages/protocol/src/
  context.ts / phase.ts / task.ts / turn.ts
    # shared typed phase output and stream event contracts

packages/adapters/src/
  openai-compatible.ts
    # provider output -> typed Rowan stream events

packages/runtime/src/
  tools.ts / types.ts
    # event-neutral tool execution primitive and hook pipeline

packages/agent/src/
  loop.ts
    # ordered state machine and effect publication
```

Acceptance:

- no `agent -> adapters` dependency;
- no Agent-local `runtime.ts` or `model-stream.ts`;
- provider output normalization is adapter-owned;
- default tool execution is runtime-owned and event-neutral;
- `runAgentLoop()` remains the owner of route / branch / plan / attempt execute / verify / outcome;
- package boundary, Agent behavior, adapter, and runtime tool execution tests pass.

### Phase D: Context Projection and Rendering

Goal: replace direct message scanning with explicit phase rendering.

Target shape:

```text
packages/context/src/
  project.ts          # Session/source events -> IntermediateAgentContext
  render.ts           # IC + phase policy -> RenderedContextSegment[]
  phase-policy.ts     # route/plan/execute/verify viewport rules
  limits.ts           # token estimation and truncation hooks
  prompt-templates.ts # prompt strings
  conversation-ir.ts  # ConversationEntry[]
```

Acceptance:

- prompt tests can snapshot what each phase sees;
- route sees semantic history and current request, not old route JSON;
- execute sees current task and current tool results, not verifier prompts;
- verify sees task output and criteria, not unrelated session noise.
- token limits reports are produced after filtering and before provider wire conversion.

### Phase E: Provider IR

Goal: isolate model provider wire formats.

Target flow:

```text
RenderedAgentContext
  -> ConversationEntry[]
  -> OpenAI Chat Completions messages
  -> ModelOutput / ModelStreamEvent
```

Acceptance:

- OpenAI-compatible adapter stops choosing context;
- OpenAI Chat request/response conversion has fixtures;
- SSE streaming chunks are parsed into `ModelStreamEvent` with fixtures;
- non-streaming JSON responses remain supported as a fallback;
- future Responses / Anthropic adapters can share Rowan context rendering.

### Phase F: Replay, Compaction, and Policy

Goal: build durable long-session and safety capabilities on top of clean streams.

Tasks:

- add `CanonicalAgentEvent` for user turns, session changes, thread starts, and future IDE/GitHub inputs;
- rebuild `IntermediateAgentContext` from source events plus driver turns;
- add compaction cursor and summary after filtering is stable;
- upgrade tool hooks into policy/approval without changing context storage;
- add replay/fork from `ExecutionTurn` and source events.

## 10. Long-Term Architecture

Longer-term capabilities should layer on top of DCP boundaries:

| Capability | Depends on | Notes |
|---|---|---|
| Policy and safety | protocol + runtime split | permissions and dangerous command handling should wrap tool execution, including local and MCP tools, not prompt rendering |
| Replay/fork | protocol + source events + ExecutionTurn | replay should not parse Pino logs as state |
| Eval harness | provider IR + static fixtures; optional replay | evals should run without replay state, then use replay-backed fixtures when available |
| Workflow graph | stable Agent facade + replay | workflow should orchestrate Agents externally, not enlarge `runAgentLoop()` |
| UI / daemon / webhooks | CanonicalAgentEvent | multiple input sources need ordered source-event ingestion |
| SQLite/DB storage | stable store port + replay pressure | JSON remains preferred until query/concurrency pressure is real |

## 11. Architecture Decisions

| ADR | Decision | Current value |
|---|---|---|
| [ADR-0001](../adr/0001-typescript-bun-runtime.md) | Runtime | TypeScript + Bun |
| [ADR-0002](../adr/0002-bun-workspace-monorepo.md) | Project shape | Bun workspace monorepo |
| [ADR-0003](../adr/0003-typebox-runtime-schemas.md) | Schema | TypeBox 1.x + compiled validators |
| [ADR-0004](../adr/0004-streamfn-model-abstraction.md) | Model abstraction | `StreamFn`, moving toward provider IR |
| [ADR-0005](../adr/0005-toolrunner-over-tool-service.md) | Tool execution | runtime-owned ToolRunner over Agent-owned tool service |
| [ADR-0006](../adr/0006-hooks-before-policy-engine.md) | Policy | hooks now, PolicyEngine after ToolRunner deepens |
| [ADR-0007](../adr/0007-agentevent-executionturn-pino-history.md) | Runtime history | `AgentEvent` + `ExecutionTurn` + Pino logs |
| [ADR-0008](../adr/0008-skill-md-loaded-into-session.md) | Skill | `SKILL.md` loaded into Session context |
| [ADR-0009](../adr/0009-openai-compatible-first-adapter.md) | First real model runtime | OpenAI-compatible Chat Completions |
| [ADR-0010](../adr/0010-contextscope-not-parallel-visibility.md) | Context visibility | `ContextScope`, not a parallel visibility field |
| [ADR-0011](../adr/0011-json-agent-store-until-query-pressure.md) | Storage | JSON-backed `AgentStore` until replay/query pressure justifies DB |
| [ADR-0012](../adr/0012-agent-loop-in-agent-runtime-as-glue.md) | Agent/runtime ownership | Agent loop in `agent`; runtime as glue |
