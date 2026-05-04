# Rowan Agent Roadmap

> 版本：v0.4.3
> 日期：2026-05-04
> 状态：planned
> 进度：v0.0.0 到 v0.4.2 已实现；v0.4.3 先收敛 Agent loop 包边界，再进入 v0.5.0 context projection/provider IR
> 相关文档：`docs/PLAN/ARCHITECTURE.md`、`docs/PLAN/v0.0.0/PLAN.md`、`docs/PLAN/v0.1.0/PLAN.md`、`docs/PLAN/v0.2.0/PLAN.md`、`docs/PLAN/v0.3.0/PLAN.md`、`docs/PLAN/v0.3.1/PLAN.md`、`docs/PLAN/v0.3.2/PLAN.md`、`docs/PLAN/v0.3.3/PLAN.md`、`docs/PLAN/v0.3.4/PLAN.md`、`docs/PLAN/v0.3.5/PLAN.md`、`docs/PLAN/v0.4.0/PLAN.md`、`docs/PLAN/v0.4.1/PLAN.md`、`docs/PLAN/v0.4.2/PLAN.md`、`docs/PLAN/v0.4.3/PLAN.md`

Architecture-review source docs:

- `CONTEXT.md`
- `docs/adr/`
- `docs/architecture/module-map.md`
- `docs/architecture/deepening-opportunities.md`

## 1. Product Positioning

Rowan 是一个面向工程化 Agent 的 Harness Runtime，用来把任务规划、工具执行、验收标准、运行日志、可验证结果和后续评测能力标准化。

当前内核已经从最小版本演进到：

```text
Session
  -> Agent
  -> route / plan / execute / verify
  -> Tool calls / child thread
  -> Acceptance criteria verification
  -> Outcome
  -> AgentStore steps
  -> Pino run log
```

下一阶段的主线不是继续堆功能，而是先把 Agent loop 的复杂度收敛到既有包边界，再在这个基础上整理上下文、provider 适配、policy 和 replay。

## 2. Implemented Baseline

Planning docs use this status enum:

| Status | Meaning |
|---|---|
| planned | Scoped but not started |
| in-progress | Actively being planned or implemented |
| implemented | Complete and release-gate verified |
| deferred | Explicitly moved out of the current version |

| Version | Name | Status | Shipped |
|---|---|---|---|
| v0.0.0 | Minimal Agent Kernel | implemented | `Agent`、`Session`、`Task`、`Tool`、acceptance criteria、same-model verifier、`Outcome`、`AgentEvent`、CLI seed |
| v0.1.0 | Real Model Runtime | implemented | OpenAI-compatible Chat Completions `StreamFn`、JSON extraction、model schema validation |
| v0.2.0 | Monorepo + Workspace Foundation | implemented | workspace root/helpers, core read/write/edit/bash tools seed, package boundary tests |
| v0.3.0 | Route-first Thread Predecessor | implemented | route phase, direct answer path, task path, thread predecessor |
| v0.3.1 | Persistent Session + Multi-turn CLI | implemented | JSON sessions, `Agent.prompt()` multi-turn, `--session`, list/delete/session CLI flows |
| v0.3.2 | Threaded Agent Sessions | implemented | ordinary child `Session`, `parentSessionId`, `task`/`goal`, `thread_created`/`thread_end` |
| v0.3.3 | Storage Port + Scoped Context | implemented | `AgentStore`, JSON-backed steps, `ExecutionTurn`, `ContextScope`, phase prompt allowlists |
| v0.3.4 | Store Package Consolidation | implemented | `packages/store`, in-memory/json stores, `AgentStore` package boundary cleanup |
| v0.3.5 | Pino Runtime Logging | implemented | `packages/logging`, run logs, redaction, removal of self-owned trace package |
| v0.4.0 | Protocol Boundary + Runtime Split | implemented | `packages/protocol`, runtime-owned runner/loop/tools/scheduler/skills/hooks/MCP boundary, `context -> protocol`, and small `agent` facade |
| v0.4.1 | Agent Boundary Correction | implemented | Agent loop/thread/phases, task outcomes, and turn recording moved back into `packages/agent/src/`; runtime trimmed to glue/integration; no `core/` folder or compatibility runtime re-exports |
| v0.4.2 | Agent Loop IO Atomization | implemented | typed phase inputs/outputs, runtime phase ports, orchestration-only loop, tool runner port seam |

## 3. Current Architecture Principles

1. `session.messages` stores semantic user-visible conversation only.
2. `ContextScope` is the context visibility boundary: `conversation`, `execution`, `diagnostic`.
3. route / plan / execute / verify internal results belong in `ExecutionTurn`.
4. Pino run logs are observability output, not replay state.
5. `AgentStore` owns persistence, but should not own protocol types long term.
6. Provider adapters should convert wire formats, not choose context.
7. The Agent loop, phases, thread semantics, retry, verification, and outcome rules belong to `packages/agent`, not `packages/runtime`.
8. Runtime should act as glue for tools, skills, hooks, MCP, workspace helpers, policy integration, and future plugin surfaces.
9. Workflow, eval, replay, and policy should layer around the Agent kernel instead of expanding `runAgentLoop()` into a platform.
10. The Agent loop should be an orchestration-only state machine: it owns ordering and retry semantics, while each phase consumes a typed input and returns a typed output.
11. Runtime may adjust phase input/output only through explicit ports; it should not mutate session, task, or loop internals through hidden shared state.
12. Tool execution should use context/result contracts so approval, manual execution, dry-run, retries, MCP tools, and local tools all share one execution path.
13. Architecture reviews must use `CONTEXT.md` domain language and check `docs/adr/` before proposing new Seams.

## 4. New Version Roadmap

The old long-term roadmap placed Policy, Replay, Eval, and Workflow immediately after v0.3.5. That remains the product direction, but the order changes: DCP boundaries come first so those capabilities have clean state to build on.

| Version | Name | Goal | Main capabilities |
|---|---|---|---|
| v0.4.0 | Protocol Boundary + Runtime Split | remove reversed dependencies and extract execution engine | `packages/protocol`, `packages/runtime`, shared turn/model/tool types, `AgentRunner`, phase modules, routing, skills, hooks, MCP boundary, core tools |
| v0.4.1 | Agent Boundary Correction | correct the over-moved runtime boundary before context work | Agent-owned loop/thread/phases, runtime as glue/integration, no `core/` folder, no compatibility runtime re-exports |
| v0.4.2 | Agent Loop IO Atomization | decouple loop steps into typed phase inputs/outputs and runtime ports | `AgentLoopConfig`, `AgentRunState`, `AgentContext`, `PhaseInputMap`, `PhaseOutputMap`, `PhaseResult`, `beforePhase`/`afterPhase`, orchestration-only loop |
| v0.4.3 | Agent Loop Package Boundary Consolidation | reduce loop complexity by returning cross-package glue to existing package boundaries | protocol shared phase output contracts, adapter-owned typed model output, runtime-owned tool execution primitive, Agent-owned orchestration/effects/outcomes |
| v0.5.0 | Context Projection + Provider IR | make context deterministic and provider-neutral on top of phase IO | `IntermediateAgentContext`, `RenderedAgentContext`, phase policy, token limits hooks, `ConversationEntry[]`, SSE streaming parser |
| v0.6.0 | Tool Runtime Policy Ports | upgrade tool hooks into explicit context/result contracts | `BeforeToolCallContext`, `BeforeToolCallResult`, `AfterToolCallContext`, `AfterToolCallResult`, `ToolExecutionMode`, shared local/MCP `ToolRunner`, permission scopes |
| v0.7.0 | Replay, Fork, and Compaction | make failed runs reconstructable and long sessions manageable | canonical events, replay from events+turns, fork from step, compaction cursor+summary |
| v0.8.0 | Eval Harness | compare models/prompts/tools using repeatable runs | datasets, scorer interface, batch runner, reports, static fixtures, optional replay-backed fixtures |
| v0.9.0 | Workflow Orchestration | compose multiple Agent runs externally | graph executor, checkpoints, human approval nodes, workflow events |
| v1.0.0 | Modular Harness Runtime | stabilize public runtime packages | stable package contracts, compatibility policy, docs, examples |

## 5. v0.4.0 Scope

v0.4.0 is architecture hardening with minimal behavior change.

Note: v0.4.0 shipped with runtime-owned execution mechanics. v0.4.1 intentionally supersedes that ownership model by moving Agent loop/thread/phases back into `packages/agent/src/`.

### 5.1 Goals

```text
packages/protocol
  -> agent facade
  -> runtime execution engine
  -> store persistence
  -> context rendering
  -> adapters/logging
```

Required changes:

- create `packages/protocol`;
- create `packages/runtime`;
- move shared contracts out of `store` and `agent`:
  - `LlmPhase`
  - `ModelRef`
  - `ModelCallUsage`
  - `ToolCall`
  - `ToolResult`
  - `ExecutionTurn`
  - `ExecutionTurnEntry`
  - `StepFilter`
- move route / plan / execute / verify from `agent-loop.ts` into runtime phase modules;
- move routing scheduler, skills execution/application, hook pipeline, MCP tool-provider ownership, and core tool execution into `runtime`;
- extract turn recording into `runtime/recorder.ts`;
- trim `agent` to a small public kernel/facade with lifecycle, state, event fanout, and optional ergonomic type re-exports only;
- make `context` import shared contracts from `protocol + session`, not `agent`;
- keep `Agent.prompt()` and CLI behavior unchanged.

### 5.2 Target Files

```text
packages/protocol/src/
  context.ts
  index.ts
  model.ts
  tool.ts
  phase.ts
  task.ts
  turn.ts
  validators.ts

packages/agent/src/
  index.ts
  agent.ts
  agent-loop.ts
  scheduler.ts
  task.ts
  tools.ts
  types.ts
  verifier.ts

packages/runtime/src/
  index.ts
  dir.ts
  runner.ts
  loop.ts
  thread.ts
  recorder.ts
  phases/index.ts
  phases/types.ts
  phases/routing.ts
  phases/verifying.ts
  hooks/
  mcp/
  skills.ts
  tools.ts
```

### 5.3 Acceptance Criteria

- `agent` no longer imports `ExecutionTurn` or `ExecutionTurnEntry` from `store`.
- v0.4.0 shipped with `agent` delegating execution to `runtime`; v0.4.1 supersedes the driver ownership part.
- v0.4.0 shipped with `runtime` owning route / plan / execute / verify and routing; v0.4.1 moves those Agent semantics back into `agent` while leaving skills, hooks, MCP tool providers, and core tool execution in `runtime`.
- `context` does not import `agent`.
- `store` persists protocol types but does not define model/tool/phase contracts.
- package boundary test is updated for `protocol`.
- `bun test packages` passes.
- `bun run build` passes.
- Direct, task, thread, multi-turn, limits, and verify retry behavior remains unchanged.

## 6. v0.4.1 Scope

v0.4.1 corrects the Agent/runtime boundary before v0.4.2 atomizes Agent loop inputs and outputs.

v0.4.0 intentionally shrank `agent`, but it moved too much Agent definition into `runtime`. The corrected ownership is:

```text
agent
  -> Agent class and public facade
  -> Agent loop
  -> route / plan / execute / verify phases
  -> thread semantics
  -> retry / verification / outcome rules

runtime
  -> workspace helpers
  -> local tool definitions and execution glue
  -> skills loading
  -> hooks and future policy integration
  -> MCP tool-provider integration
  -> plugin/runtime adapters for the Agent loop
```

Required changes:

- move `packages/runtime/src/loop.ts` to `packages/agent/src/loop.ts`;
- move `packages/runtime/src/thread.ts` to `packages/agent/src/thread.ts`;
- move `packages/runtime/src/phases/*` to `packages/agent/src/phases/*`;
- keep `packages/agent/src/agent.ts` as the Agent core/facade entrypoint;
- do not create `packages/agent/src/core/` or a new `packages/agent-core`;
- remove obsolete runtime exports for loop, thread, phases, and runner APIs;
- do not add compatibility re-exports because there is no stable external API yet;
- keep runtime focused on tools, skills, hooks, MCP, workspace helpers, and future plugin/policy glue;
- update package boundary tests and READMEs.

Acceptance:

- `Agent.prompt()` and `Agent.startThread()` behavior stays unchanged.
- `packages/agent/src/agent.ts` wires session lifecycle, event fanout, abort/waitForIdle, store orchestration, and Agent-owned loop entry.
- `packages/agent/src/loop.ts`, `thread.ts`, and `phases/*` own Agent driver behavior.
- `packages/runtime` no longer exports Agent loop/thread/phase APIs.
- No `core/` folder exists.
- `bun test packages` and `bun run build` pass.

## 7. v0.4.2 Scope

v0.4.2 makes the corrected Agent/runtime ownership actionable by atomizing the Agent loop.

The guiding rule is:

```text
agent
  -> owns the ordered chain, state machine, attempts, thread semantics, and outcomes

runtime
  -> adjusts each phase input/output through explicit ports
  -> owns tool execution glue, policy hooks, MCP/plugin integration, and workspace helpers
```

### 7.1 Target Flow

```text
Agent.prompt()
  -> AgentLoopConfig
  -> AgentRunState
  -> runAgentLoop()

runAgentLoop()
  -> route(input) -> route(output)
  -> direct | thread | task
  -> plan(input) -> plan(output)
  -> attempt loop:
       execute(input) -> execute(output)
       executeTools(tool input) -> tool output
       verify(input) -> verify(output)
  -> outcome
```

Each node has one typed input and one typed output. Runtime can participate only through explicit hooks:

```text
PhaseInput
  -> runtime.beforePhase()
  -> phase runner
  -> runtime.afterPhase()
  -> PhaseOutput
```

### 7.2 Core Contracts

v0.4.2 introduces the minimal contracts needed to stop passing the whole mutable loop runtime into every helper:

```ts
type AgentLoopConfig = {
  model: ModelRef;
  stream: StreamFn;
  maxAttempts: number;
  verifyTasks: boolean;
  limits?: AgentRunLimits;
  runtime?: AgentRuntimePort;
};

type AgentRunState = {
  session: Session<AgentEvent>;
  status: "routing" | "planning" | "executing" | "verifying" | "completed";
  task?: Task;
  attempt: number;
  toolResults: ToolResult[];
  limitUsage: AgentLimitUsage;
  depth: RuntimeDepth;
  lastExecuteText?: string;
};

type AgentContext = {
  config: AgentLoopConfig;
  state: Readonly<AgentRunState>;
  signal?: AbortSignal;
  emit(event: AgentEvent): Promise<void>;
  record(step: ExecutionTurn): Promise<void>;
  runThread?: RunThread;
};

type PhaseInputMap = {
  route: RouteInput;
  plan: PlanInput;
  execute: ExecuteInput;
  verify: VerifyInput;
};

type PhaseOutputMap = {
  route: TaskRoutingDecision;
  plan: { task: Task };
  execute: { text?: string; toolCalls: ToolCall[]; taskOutput: TaskOutput };
  verify: VerificationResult;
};

type PhaseResult<K extends LlmPhase> =
  | { action: "continue"; output: PhaseOutputMap[K]; effects?: AgentEffect[] }
  | { action: "skip"; output: PhaseOutputMap[K]; reason?: string }
  | { action: "retry"; input?: PhaseInputMap[K]; reason?: string }
  | { action: "abort"; outcome: Outcome; reason?: string };
```

The exact names may change during implementation, but the shape is locked: config, state, context, phase input, phase output, phase result.

### 7.3 Runtime Phase Port

Runtime should not own the loop, but it can transform phase IO:

```ts
type AgentRuntimePort = {
  beforePhase?<K extends LlmPhase>(
    context: AgentContext,
    phase: K,
    input: PhaseInputMap[K],
  ): Promise<
    | { input?: PhaseInputMap[K] }
    | { skip: PhaseOutputMap[K] }
    | { abort: Outcome }
  >;

  afterPhase?<K extends LlmPhase>(
    context: AgentContext,
    phase: K,
    output: PhaseOutputMap[K],
  ): Promise<
    | { output?: PhaseOutputMap[K] }
    | { retry?: PhaseInputMap[K] }
    | { abort: Outcome }
  >;

  tools?: ToolRunner;
};
```

Runtime examples:

- inject or redact phase input;
- switch verification behavior for a runtime mode;
- short-circuit a phase in tests or deterministic replay;
- attach policy, MCP, plugin, or workspace evidence without mutating loop state directly.

### 7.4 Required Changes

- split the current private `AgentLoopRuntime` into immutable config, mutable state, and narrow context;
- change route / plan / execute / verify helpers so they accept only their phase input;
- centralize event/session/message/step effects so phase helpers return effects instead of mutating session directly;
- extract a model turn collector that returns text, structured output, tool calls, usage, and turn entries without owning phase policy;
- add a `runPhase()` helper that applies runtime `beforePhase` / `afterPhase` around the core phase runner;
- split execute into model execution and tool execution so runtime can own `ToolRunner` without owning task retry semantics;
- keep `runAgentLoop()` as the only owner of phase order, retry loop, verification branching, and final outcome publishing;
- preserve public `Agent.prompt()` / `Agent.startThread()` behavior.

### 7.5 Acceptance Criteria

- no phase helper receives the whole mutable loop runtime;
- loop order is readable as a chain of route / branch / plan / attempt execute / verify / outcome;
- runtime hooks can adjust phase input and output without mutating `session.messages` directly;
- tool execution is callable through a runtime-owned `ToolRunner` port;
- existing direct, task, thread, limits, and verify retry tests still pass;
- new tests cover `beforePhase` input adjustment, `afterPhase` output adjustment, skip, retry, abort, and unchanged default behavior.

### 7.6 v0.4.3 Scope

v0.4.3 is the cleanup pass after v0.4.2. It keeps the Agent loop in `packages/agent`, but moves remaining cross-package glue to the packages that already own those boundaries.

Target ownership:

```text
protocol
  -> shared phase output and stream event contracts

adapters
  -> provider output normalization into typed phase output events

runtime
  -> event-neutral tool execution primitives, hook invocation, schema validation/cache

agent
  -> ordered run state machine, effects, attempts, verification, thread depth, outcomes
```

Required changes:

- avoid creating new Agent-local `runtime.ts` or `model-stream.ts` files;
- keep `agent` from importing `adapters`;
- move shared phase output contracts to `protocol` where cross-package use requires it;
- let adapters emit typed phase outputs instead of requiring Agent-owned provider JSON repair;
- let runtime execute default tool calls through an event-neutral primitive;
- keep Agent-owned session/message/event/turn materialization and final outcome publishing.

Acceptance:

- Agent loop no longer owns provider JSON repair/normalization;
- default tool execution goes through runtime-owned primitives;
- package boundary tests still pass;
- direct/task/thread/multi-turn/limits/invalid schema/invalid tool args/verify retry tests pass;
- v0.5.0 context projection can start without further loop-boundary cleanup.

## 8. v0.5.0 Scope

v0.5.0 makes the Cahciua-inspired DCP direction real in Rowan, now on top of phase IO boundaries.

### 8.1 Goals

```text
Session + source events + driver turns
  -> IntermediateAgentContext
  -> RenderedAgentContext
  -> ConversationEntry[]
  -> provider wire input
```

Required changes:

- add `IntermediateAgentContext`;
- add `RenderedContextSegment`;
- add token limits metadata and truncation hooks in the `IntermediateAgentContext -> RenderedAgentContext` path;
- add phase policy for route / plan / execute / verify;
- change prompt builder from direct `session.messages` scanning to rendered context consumption;
- add `ConversationEntry[]` as provider-neutral model input;
- make OpenAI-compatible adapter convert `ConversationEntry[]` to Chat Completions messages;
- add an adapter-level SSE streaming parser that maps provider chunks into `ModelStreamEvent`;
- preserve non-streaming JSON response handling as a compatibility fallback.

### 8.2 Token Limits Contract

v0.5.0 does not need a full compaction strategy, but it must define the hard limits hook before context rendering is considered stable:

```ts
type ContextLimits = {
  maxInputTokens?: number;
  reserveOutputTokens?: number;
  strategy?: "fail" | "truncate-oldest" | "truncate-lowest-priority";
};

type ContextLimitsReport = {
  estimatedInputTokens: number;
  truncatedSegments: string[];
  hardLimitHit: boolean;
};
```

Rules:

- token counting may start with provider/model-specific estimators and improve later;
- truncation happens after phase visibility filtering and before provider wire conversion;
- `conversation` segments are preferred over `execution` and `diagnostic` segments unless a phase policy explicitly requires evidence;
- compaction in v0.7.0 consumes this limits report but does not own first-line hard truncation.

### 8.3 Streaming Contract

SSE streaming belongs to v0.5.0 because provider IR is where Rowan can cleanly separate provider wire chunks from model-visible context.

Required behavior:

- parse OpenAI-compatible `text/event-stream` responses, including `[DONE]`;
- map text deltas, tool call deltas, structured output fragments, usage, and provider errors into `ModelStreamEvent`;
- expose stream parser fixtures independent of live network calls;
- keep current non-streaming response path for deterministic tests and providers that do not support streaming.

### 8.4 Phase Visibility Policy

| Phase | Should see | Should not see |
|---|---|---|
| route | current user request, recent `conversation` messages, session task/goal, skills/tools summary | old routing JSON, old phase prompts, failed verifier text, unrelated tool results |
| plan | current user request, semantic conversation, available tools/skills, thread task/goal | old planner JSON, verifier prompts, unrelated tool results |
| execute | task, allowed tools, current attempt tool results, necessary semantic context | route examples as history, old verifier text |
| verify | task, criteria, task output, necessary evidence | route/plan format examples, unrelated conversation chatter |

### 8.5 Acceptance Criteria

- prompt tests snapshot each phase viewport;
- route contamination tests cover routing decision, failed outcome, verifier text, and tool result leakage;
- token limits tests cover counting hook invocation, hard-limit failure, and oldest/lowest-priority truncation behavior;
- SSE parser fixture tests cover text delta, tool call delta, usage, error, and done events;
- OpenAI-compatible tests still pass through the new IR;
- no provider adapter chooses which session history is visible.

## 9. v0.6.0 Scope

v0.6.0 upgrades the current tool hooks into explicit runtime policy ports inspired by pi Agent's context/result shape.

### 9.1 Tool Execution Contract

```ts
type ToolExecutionMode = "auto" | "approval" | "manual" | "dryRun" | "disabled";

type BeforeToolCallContext = {
  agent: AgentContext;
  task: Task;
  tool: Tool;
  toolCall: ToolCall;
  args: unknown;
  mode: ToolExecutionMode;
};

type BeforeToolCallResult =
  | { allow: true; args?: unknown; mode?: ToolExecutionMode }
  | { allow: false; reason: string }
  | { result: ToolResult };

type AfterToolCallContext = {
  agent: AgentContext;
  task: Task;
  tool: Tool;
  toolCall: ToolCall;
  args: unknown;
  result: ToolResult;
  mode: ToolExecutionMode;
};

type AfterToolCallResult =
  | { result: ToolResult }
  | { retry: true; args?: unknown; reason?: string }
  | { abort: true; reason: string };
```

Required changes:

- introduce a runtime-owned `ToolRunner` that resolves tools, validates args, applies policy, executes local or MCP tools, normalizes results, and emits tool events;
- replace thin `beforeToolCall` / `afterToolCall` callbacks with context/result contracts while preserving compatibility adapters if useful;
- define permission scopes for read/write/edit/bash/thread/MCP;
- route MCP-provided tools through the same `ToolRunner`, hook pipeline, and permission scopes as local tools;
- support `auto`, `approval`, `manual`, `dryRun`, and `disabled` execution modes;
- add dangerous command detection for destructive shell actions;
- add CLI approval prompts where interactive execution is available;
- emit policy events for approvals, denials, overrides, retries, and manual completions;
- keep non-interactive mode deterministic.

Dangerous command detection strategy:

- normalize and lex shell input before matching rules; avoid plain substring checks as the only guard;
- classify by command family plus flags/arguments, for example `rm -rf`, `git reset --hard`, `git clean -fd`, `chmod -R 777`, `chown -R`, `dd`, `mkfs`, disk erase commands, `docker rm -f`, `kubectl delete`, and database `DROP` / `TRUNCATE`;
- mark commands that target workspace root, home, absolute system paths, or broad globs as higher severity;
- support an allowlist for exact commands or scoped path prefixes;
- route false positives through an explicit approval/override path in interactive mode;
- in non-interactive mode, deny high-severity matches unless a policy file grants the exact command scope;
- emit a structured policy event with rule id, severity, matched command family, decision, and override reason.

Acceptance:

- policy decisions happen before tool execution;
- denials and dry-runs are recorded as tool results and AgentEvents;
- local tools and MCP tools share the same runner path;
- tests cover approval allow, approval deny, arg rewrite, short-circuit result, retry, manual mode, dry-run, non-interactive default, and dangerous command guard.

## 10. v0.7.0 Scope

v0.7.0 turns `ExecutionTurn` and future source events into real replay/fork infrastructure.

Required changes:

- add `CanonicalAgentEvent` for user turns, session instruction changes, thread starts, and future IDE/GitHub inputs;
- persist source events separately from driver turns;
- implement replay from source events + driver turns into rendered context;
- add fork from a selected turn/cursor;
- add compaction cursor + summary after context filtering is stable;
- consume the v0.5.0 token limits report so compaction is layered after hard truncation hooks.

Acceptance:

- replay reconstructs the same rendered context for a stored run;
- fork starts a new session from a selected point without copying internal noise into conversation;
- compaction never summarizes `execution` or `diagnostic` content unless explicitly selected by policy.

## 11. v0.8.0 Scope

v0.8.0 builds the eval harness on provider-neutral runs. Replay-backed fixtures are preferred, but eval must also support static fixtures so v0.8.0 is not blocked if v0.7.0 replay ships in a smaller form.

Required changes:

- dataset schema for prompts, tools, expected outcomes, and workspace fixtures;
- scorer interface with programmatic scorer first and LLM judge second;
- batch runner across model/provider configs;
- summary report with pass rate, cost/usage, failure categories;
- static fixture runner for prompt/context/model-output regressions;
- replay-backed fixtures as an enhancement when replay data is available.

Acceptance:

- a small local dataset can compare two model configs;
- eval output can identify route, plan, execute, and verify failures separately;
- evals can run from static fixtures without replay state;
- scoring does not require parsing Pino logs as state.

## 12. v0.9.0 Scope

v0.9.0 introduces workflow as an outer orchestration layer.

Required changes:

- graph executor around `Agent.prompt()` / `Agent.startThread()`;
- checkpoint and resume at workflow node boundaries;
- human approval node;
- workflow-level events that reference session ids and turn ids;
- no workflow graph logic inside the low-level driver loop.

Acceptance:

- simple multi-step workflows can run and resume;
- workflow state references Agent sessions rather than embedding duplicate run history;
- Agent kernel remains usable without workflow.

## 13. v1.0.0 Scope

v1.0.0 stabilizes Rowan as a modular harness runtime.

Required changes:

- stable package exports and dependency direction;
- compatibility policy for persisted session/store schemas;
- documented provider adapter contract;
- documented tool and policy contract;
- examples for CLI, embedded runtime, custom tools, custom model adapter, and replay/eval.

## 14. Updated Execution Order

Near-term order:

1. Implement v0.4.3 Agent loop package-boundary consolidation.
2. Implement v0.5.0 context projection/rendering and provider IR on top of typed phase IO.
3. Upgrade tool execution and policy as v0.6.0, with local and MCP tools sharing one runtime path.
4. Build replay/compaction after source events, driver turns, and rendered contexts are clean.
5. Build eval and workflow on replayable state.

## 15. Deferred Decisions

Deferred decisions must be triaged after each version is implemented. Current triage:

| Decision | Status | Current direction |
|---|---|---|
| Should `runtime` own skill file loading itself, or only skill application after CLI/session loads skills? | deferred | v0.4.0 moves skill application to runtime; file loading can stay in CLI/session composition until a concrete runtime embedder needs otherwise. |
| Should core tools all move into `runtime` in v0.4.0, or should v0.4.0 first move only the tool execution path? | implemented | v0.4.0 scope moves core tool execution and default tool definitions to runtime, while policy redesign stays in v0.6.0. |
| Should MCP live in a separate package or inside `runtime`? | implemented | MCP implementation lives under `packages/runtime/src/mcp/` as a tool provider source; no sibling `packages/mcp` package unless future dependency pressure proves it necessary. |
| Should the execution package be named `runtime` or `runner`? | superseded | v0.4.0 kept package name `runtime`; v0.4.1 corrects the deeper issue by moving Agent loop/thread/phases into `agent` and leaving `runtime` as glue/integration. |
| Should v0.4.1 preserve compatibility re-exports from `runtime`? | implemented | No. There is no stable external API yet, so obsolete runtime loop/thread/phase exports should be removed cleanly. |
| Should v0.4.1 create a `core/` folder or package? | implemented | No. `packages/agent/src/agent.ts` is the Agent core/facade entrypoint, with loop/thread/phases moved beside it in `packages/agent/src/`. |
| Should v0.4.3 split `loop.ts` into many new Agent-local files? | planned | No. Use existing package boundaries first: `protocol` for shared contracts, `adapters` for provider output, `runtime` for tool execution, and `agent` for orchestration/effects. |
| Where should architecture review candidates live? | implemented | Use `docs/architecture/deepening-opportunities.md`; release plans should link to candidates instead of becoming the review backlog. |
| Should `CanonicalAgentEvent` be persisted in the same session JSON or a sidecar JSONL? | planned | Decide in v0.7.0 when source events are introduced. |
| Does replay require workspace snapshotting in v0.7.0, or only command/tool output replay first? | planned | Start with command/tool output replay; workspace snapshots require separate storage pressure. |
| Should v0.8.0 prioritize programmatic scorers over LLM judges? | implemented | Programmatic scorers first, LLM judge second. |
| When does JSON storage become insufficient enough to justify SQLite? | planned | Keep JSON until replay/query/concurrency pressure is real. |
