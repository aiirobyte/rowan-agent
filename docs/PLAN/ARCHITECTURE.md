# Rowan Agent Technical Architecture

> 版本：v0.3.5
> 日期：2026-05-03
> 状态：in-progress
> 进度：v0.0.0 到 v0.3.5 已实现；v0.4.0+ 进入 DCP-style architecture hardening
> 输入文档：`docs/PLAN/ROADMAP.md`、`docs/PLAN/v0.0.0/PLAN.md`、`docs/PLAN/v0.1.0/PLAN.md`、`docs/PLAN/v0.2.0/PLAN.md`、`docs/PLAN/v0.3.0/PLAN.md`、`docs/PLAN/v0.3.1/PLAN.md`、`docs/PLAN/v0.3.2/PLAN.md`、`docs/PLAN/v0.3.3/PLAN.md`、`docs/PLAN/v0.3.4/PLAN.md`、`docs/PLAN/v0.3.5/PLAN.md`、`docs/PLAN/v0.4.0/PLAN.md`、`.agent/docs/2026-05-03-cahciua-dcp-reuse-plan.md`

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
  -> Driver: route / plan / execute / verify
  -> Ports: ModelClient / ToolRunner / AgentStore / EventLogger
  -> Runtime tool providers: local tools / MCP
  -> Adapters: OpenAI-compatible / JSON store / Pino log
```

DCP 在这里指 deterministic context pipeline：外部输入、模型/工具运行结果、上下文渲染策略彼此分层，避免内部运行噪声污染未来 prompt。

## 2. Implemented Versions

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

## 3. Current Package Architecture

Current tracked package layout:

```text
packages/
  protocol/  Zero-dependency shared contracts: model, phase, tool, task, context, turn
  session/    Session, AgentMessage, Skill, ContextScope, persisted session helpers
  store/      AgentStore port, protocol ExecutionTurn persistence, in-memory/json stores
  runtime/    AgentRunner, run loop, thread runner, turn recorder, routing, tools, skills, hooks/MCP boundary, workspace helpers
  agent/      Small public facade/kernel: Agent, state/lifecycle, event fanout, abort/waitForIdle, ergonomic re-exports
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
agent        -> runtime, session, store
adapters     -> protocol, context
logging      -> agent
cli          -> adapters, agent, logging, runtime, session, store
```

v0.4.0 resolves the v0.3.5 pressure points:

- `agent` no longer imports `ExecutionTurn` / `ExecutionTurnEntry` from `store`.
- `context` imports protocol-shaped context/tool contracts instead of importing `agent`.
- `store` validates and persists protocol turn types instead of owning shared model/tool/phase contracts.
- `runtime` owns the execution loop, thread runner, scheduler, tools, hooks/MCP boundary, skills loading, and turn recording.
- `agent` is now the public facade/kernel and delegates execution to `runtime`.

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
| `diagnostic` | errors, budget failures, invalid model output | trace/debug only |

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

## 5. Current Runtime Flow

```text
Agent.prompt(input)
  -> create/append Session user turn
  -> runAgentLoop()
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
  prompt(input: string): Promise<Outcome>;
  startThread(input: AgentThreadInput): Promise<ThreadRunResult>;
  abort(reason?: string): void;
  waitForIdle(): Promise<void>;
  subscribe(listener: AgentEventListener): Unsubscribe;
}
```

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
  agent/           small public Agent facade/kernel surface, lifecycle, state, event fanout
  runtime/         agent execution runtime: runner, routing, phase driver, skills, tools, hooks, MCP
  adapters/        provider wire adapters
  store/           AgentStore implementations
  logging/         AgentEvent log sinks
  cli/             composition root
```

Target dependency direction after v0.4.0:

```text
protocol    -> none
session     -> none
store       -> protocol, session
context     -> protocol, session
runtime     -> protocol, session, store, context
agent       -> protocol, session, store, runtime
adapters    -> protocol, context
logging     -> agent
cli         -> adapters, agent, logging, protocol, runtime, session, store
```

The key correction is that `context` should be an upstream input-rendering package, not an `agent` downstream package. After `protocol` exists, `context` may use protocol contracts and session state, but it should not import the public `Agent` facade or runtime implementation details.

The minimal path can avoid creating every package immediately:

- create `protocol` first;
- create `runtime` as the execution engine package instead of separate `driver` and `tools` packages;
- move route / plan / execute / verify, scheduler, skills application, hooks, MCP tool providers, and core tool execution into `runtime`;
- keep `agent` as the small public facade/kernel surface that owns session lifecycle, state, event fanout, abort handling, and persistence orchestration.
- allow `agent` to re-export ergonomic public kernel contracts such as `AgentMessage`, `ToolCall`, `ToolResult`, `StreamFn`, and `AgentEvent`, but do not let `agent` own shared domain types; definitions live in `protocol` / `session`.

Terminology lock:

```text
runtime = agent execution runtime package and system layer
runner = runtime internal executor for one Agent run
sandbox/environment = tool or code execution environment
workflow = outer orchestration layer around Agent runs
```

MCP belongs inside `packages/runtime`, not a sibling package. MCP tools should enter Rowan as a `ToolProvider` / `ToolRunner` source and should be rendered to models through the same tool descriptor path as local tools.

Future package responsibilities:

```text
agent
  -> Agent class and public API
  -> minimal public kernel exports/re-exports
  -> AgentState
  -> Session create/load/save lifecycle
  -> user turn append and child thread lifecycle
  -> event subscription/fanout
  -> abort / waitForIdle
  -> delegates execution to runtime
  -> does not own phase workflow, task planning, verification, DriverTurn, tool running, context rendering, or provider wire conversion

runtime
  -> AgentRunner / runTurn / runAgentLoop implementation
  -> route / plan / execute / verify phases
  -> routing scheduler
  -> skill loading/application policy
  -> tool registry and tool runner
  -> core tool definitions and tool execution
  -> hook pipeline and policy hook invocation
  -> MCP client/tool provider implementation
  -> ExecutionTurn recording
```

## 8. DCP Refactor Principles

1. `session.messages` only stores semantic conversation.
2. `ExecutionTurn` moves from `store` to `protocol`; `store` persists it but does not own the domain type.
3. `context` owns projection and rendering, not provider wire format, and depends on `protocol + session` rather than `agent`.
4. `adapters` convert `ConversationEntry[]` to provider requests and provider responses back to Rowan events/output.
5. `runtime` owns route / plan / execute / verify, routing, skills, hooks, MCP tool providers, and core tool execution.
6. `agent` stays a small public kernel/facade: lifecycle, subscriptions, abort/waitForIdle, persistence orchestration, and ergonomic type re-exports only.
7. Source input and Driver output remain orthogonal streams and are merged only by phase-specific rendering.
8. Filtering happens before compaction; never summarize internal execution noise into long-term context.

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

### Phase B: Runtime Package Split

Goal: move execution mechanics out of `agent` and into one cohesive runtime package.

Target shape:

```text
packages/agent/src/
  agent.ts
  thread.ts
  lifecycle.ts

packages/runtime/src/
  index.ts
  runner.ts
  run-agent-loop.ts
  runtime.ts
  turn-recorder.ts
  routing/scheduler.ts
  phases/route.ts
  phases/plan.ts
  phases/execute.ts
  phases/verify.ts
  hooks/
  mcp/
  skills/
  tools/
```

Acceptance:

- public `Agent.prompt()` behavior stays unchanged;
- route, plan, execute, verify behavior moves behind the runtime boundary;
- core tools, routing, hooks, and MCP tool-provider boundaries are exported from `runtime`;
- `agent` no longer owns task planner, verifier, scheduler, tool runner, or DriverTurn recording implementation;
- budget, thread, verify retry, and multi-turn tests still pass.

### Phase C: Context Projection and Rendering

Goal: replace direct message scanning with explicit phase rendering.

Target shape:

```text
packages/context/src/
  project.ts          # Session/source events -> IntermediateAgentContext
  render.ts           # IC + phase policy -> RenderedContextSegment[]
  phase-policy.ts     # route/plan/execute/verify viewport rules
  budget.ts           # token estimation and truncation hooks
  prompt-templates.ts # prompt strings
  conversation-ir.ts  # ConversationEntry[]
```

Acceptance:

- prompt tests can snapshot what each phase sees;
- route sees semantic history and current request, not old route JSON;
- execute sees current task and current tool results, not verifier prompts;
- verify sees task output and criteria, not unrelated session noise.
- token budget reports are produced after filtering and before provider wire conversion.

### Phase D: Provider IR

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

### Phase E: Replay, Compaction, and Policy

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
| ADR-0001 | Runtime | TypeScript + Bun |
| ADR-0002 | Project shape | Bun workspace monorepo |
| ADR-0003 | Schema | TypeBox 1.x + `Schema.Compile()` |
| ADR-0004 | Model abstraction | `StreamFn`, moving toward provider IR |
| ADR-0005 | Tool collection | `Tool[]` compatibility input, moving toward `ToolProvider -> ToolRunner`; MCP providers live in `runtime` |
| ADR-0006 | Policy | hooks now, PolicyEngine after runtime split |
| ADR-0007 | Runtime history | `AgentEvent` + `ExecutionTurn` + Pino logs |
| ADR-0008 | Skill | `SKILL.md` loaded into context |
| ADR-0009 | First real model runtime | OpenAI-compatible Chat Completions |
| ADR-0010 | Context visibility | `ContextScope`, not a parallel visibility field |
| ADR-0011 | Storage | JSON-backed `AgentStore` until replay/query pressure justifies DB |
