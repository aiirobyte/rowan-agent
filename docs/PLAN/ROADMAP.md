# Rowan Agent Roadmap

> 版本：v0.4.0-planning
> 日期：2026-05-03
> 状态：in-progress
> 进度：v0.0.0 到 v0.3.5 已实现；v0.4.0+ 路线已重排为 DCP-first architecture hardening
> 相关文档：`docs/PLAN/ARCHITECTURE.md`、`docs/PLAN/v0.0.0/PLAN.md`、`docs/PLAN/v0.1.0/PLAN.md`、`docs/PLAN/v0.2.0/PLAN.md`、`docs/PLAN/v0.3.0/PLAN.md`、`docs/PLAN/v0.3.1/PLAN.md`、`docs/PLAN/v0.3.2/PLAN.md`、`docs/PLAN/v0.3.3/PLAN.md`、`docs/PLAN/v0.3.4/PLAN.md`、`docs/PLAN/v0.3.5/PLAN.md`、`docs/PLAN/v0.4.0/PLAN.md`

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

下一阶段的主线不是继续堆功能，而是先把上下文、运行历史、provider 适配和持久化边界整理成 DCP-style pipeline。

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

## 3. Current Architecture Principles

1. `session.messages` stores semantic user-visible conversation only.
2. `ContextScope` is the context visibility boundary: `conversation`, `execution`, `diagnostic`.
3. route / plan / execute / verify internal results belong in `ExecutionTurn`.
4. Pino run logs are observability output, not replay state.
5. `AgentStore` owns persistence, but should not own protocol types long term.
6. Provider adapters should convert wire formats, not choose context.
7. Workflow, eval, replay, and policy should layer around the Agent kernel instead of expanding `runAgentLoop()` into a platform.

## 4. New Version Roadmap

The old long-term roadmap placed Policy, Replay, Eval, and Workflow immediately after v0.3.5. That remains the product direction, but the order changes: DCP boundaries come first so those capabilities have clean state to build on.

| Version | Name | Goal | Main capabilities |
|---|---|---|---|
| v0.4.0 | Protocol Boundary + Runtime Split | remove reversed dependencies and extract execution engine | `packages/protocol`, `packages/runtime`, shared turn/model/tool types, `AgentRunner`, phase modules, routing, skills, hooks, MCP boundary, core tools |
| v0.5.0 | Context Projection + Provider IR | make context deterministic and provider-neutral | `IntermediateAgentContext`, `RenderedAgentContext`, phase policy, token budget hooks, `ConversationEntry[]`, SSE streaming parser |
| v0.6.0 | Policy and Safety | upgrade hooks into explicit tool execution policy | approvals, permission scopes, dangerous command guard, policy events |
| v0.7.0 | Replay, Fork, and Compaction | make failed runs reconstructable and long sessions manageable | canonical events, replay from events+turns, fork from step, compaction cursor+summary |
| v0.8.0 | Eval Harness | compare models/prompts/tools using repeatable runs | datasets, scorer interface, batch runner, reports, static fixtures, optional replay-backed fixtures |
| v0.9.0 | Workflow Orchestration | compose multiple Agent runs externally | graph executor, checkpoints, human approval nodes, workflow events |
| v1.0.0 | Modular Harness Runtime | stabilize public runtime packages | stable package contracts, compatibility policy, docs, examples |

## 5. v0.4.0 Scope

v0.4.0 is architecture hardening with minimal behavior change.

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
- extract turn recording into `runtime/turn-recorder.ts`;
- trim `agent` to a small public kernel/facade with lifecycle, state, event fanout, and optional ergonomic type re-exports only;
- make `context` import shared contracts from `protocol + session`, not `agent`;
- keep `Agent.prompt()` and CLI behavior unchanged.

### 5.2 Target Files

```text
packages/protocol/src/
  index.ts
  model.ts
  tool.ts
  phase.ts
  turn.ts

packages/agent/src/
  index.ts
  agent.ts
  thread.ts
  lifecycle.ts

packages/runtime/src/
  index.ts
  dir.ts
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

### 5.3 Acceptance Criteria

- `agent` no longer imports `ExecutionTurn` or `ExecutionTurnEntry` from `store`.
- `agent` delegates execution to `runtime` and keeps only public API / state / lifecycle / event fanout ownership.
- `agent` does not own phase workflow, task planning, verification, tool execution, or turn recording.
- `runtime` owns route / plan / execute / verify, routing, skills, hooks, MCP tool providers, and core tool execution.
- `context` does not import `agent`.
- `store` persists protocol types but does not define model/tool/phase contracts.
- package boundary test is updated for `protocol`.
- `bun test packages` passes.
- `bun run build` passes.
- Direct, task, thread, multi-turn, budget, and verify retry behavior remains unchanged.

## 6. v0.5.0 Scope

v0.5.0 makes the Cahciua-inspired DCP direction real in Rowan.

### 6.1 Goals

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
- add token budget metadata and truncation hooks in the `IntermediateAgentContext -> RenderedAgentContext` path;
- add phase policy for route / plan / execute / verify;
- change prompt builder from direct `session.messages` scanning to rendered context consumption;
- add `ConversationEntry[]` as provider-neutral model input;
- make OpenAI-compatible adapter convert `ConversationEntry[]` to Chat Completions messages;
- add an adapter-level SSE streaming parser that maps provider chunks into `ModelStreamEvent`;
- preserve non-streaming JSON response handling as a compatibility fallback.

### 6.2 Token Budget Contract

v0.5.0 does not need a full compaction strategy, but it must define the hard budget hook before context rendering is considered stable:

```ts
type ContextBudget = {
  maxInputTokens?: number;
  reserveOutputTokens?: number;
  strategy?: "fail" | "truncate-oldest" | "truncate-lowest-priority";
};

type ContextBudgetReport = {
  estimatedInputTokens: number;
  truncatedSegments: string[];
  hardLimitHit: boolean;
};
```

Rules:

- token counting may start with provider/model-specific estimators and improve later;
- truncation happens after phase visibility filtering and before provider wire conversion;
- `conversation` segments are preferred over `execution` and `diagnostic` segments unless a phase policy explicitly requires evidence;
- compaction in v0.7.0 consumes this budget report but does not own first-line hard truncation.

### 6.3 Streaming Contract

SSE streaming belongs to v0.5.0 because provider IR is where Rowan can cleanly separate provider wire chunks from model-visible context.

Required behavior:

- parse OpenAI-compatible `text/event-stream` responses, including `[DONE]`;
- map text deltas, tool call deltas, structured output fragments, usage, and provider errors into `ModelStreamEvent`;
- expose stream parser fixtures independent of live network calls;
- keep current non-streaming response path for deterministic tests and providers that do not support streaming.

### 6.4 Phase Visibility Policy

| Phase | Should see | Should not see |
|---|---|---|
| route | current user request, recent `conversation` messages, session task/goal, skills/tools summary | old routing JSON, old phase prompts, failed verifier text, unrelated tool results |
| plan | current user request, semantic conversation, available tools/skills, thread task/goal | old planner JSON, verifier prompts, unrelated tool results |
| execute | task, allowed tools, current attempt tool results, necessary semantic context | route examples as history, old verifier text |
| verify | task, criteria, task output, necessary evidence | route/plan format examples, unrelated conversation chatter |

### 6.5 Acceptance Criteria

- prompt tests snapshot each phase viewport.
- route contamination tests cover routing decision, failed outcome, verifier text, and tool result leakage.
- token budget tests cover counting hook invocation, hard-limit failure, and oldest/lowest-priority truncation behavior.
- SSE parser fixture tests cover text delta, tool call delta, usage, error, and done events.
- OpenAI-compatible tests still pass through the new IR.
- no provider adapter chooses which session history is visible.

## 7. v0.6.0 Scope

v0.6.0 returns to the previously planned policy and safety work, now on cleaner driver boundaries.

Required changes:

- turn `beforeToolCall` / `afterToolCall` into a PolicyEngine-compatible port;
- define permission scopes for read/write/edit/bash/thread;
- route MCP-provided tools through the same runtime `ToolRunner`, hook pipeline, and permission scopes as local tools;
- add dangerous command detection for destructive shell actions;
- add CLI approval prompts where interactive execution is available;
- emit policy events for approvals, denials, and overrides;
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
- denials are recorded as tool results and AgentEvents;
- tests cover approval allow, approval deny, non-interactive default, and dangerous command guard.

## 8. v0.7.0 Scope

v0.7.0 turns `ExecutionTurn` and future source events into real replay/fork infrastructure.

Required changes:

- add `CanonicalAgentEvent` for user turns, session instruction changes, thread starts, and future IDE/GitHub inputs;
- persist source events separately from driver turns;
- implement replay from source events + driver turns into rendered context;
- add fork from a selected turn/cursor;
- add compaction cursor + summary after context filtering is stable;
- consume the v0.5.0 token budget report so compaction is layered after hard truncation hooks.

Acceptance:

- replay reconstructs the same rendered context for a stored run;
- fork starts a new session from a selected point without copying internal noise into conversation;
- compaction never summarizes `execution` or `diagnostic` content unless explicitly selected by policy.

## 9. v0.8.0 Scope

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

## 10. v0.9.0 Scope

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

## 11. v1.0.0 Scope

v1.0.0 stabilizes Rowan as a modular harness runtime.

Required changes:

- stable package exports and dependency direction;
- compatibility policy for persisted session/store schemas;
- documented provider adapter contract;
- documented tool and policy contract;
- examples for CLI, embedded runtime, custom tools, custom model adapter, and replay/eval.

## 12. Updated Execution Order

Near-term order:

1. Implement v0.4.0 protocol boundary and runtime split.
2. Implement v0.5.0 context projection/rendering and provider IR.
3. Then resume policy/safety work as v0.6.0, with local and MCP tools sharing the runtime `ToolRunner`.
4. Build replay/compaction after source events and driver turns are clean.
5. Build eval and workflow on replayable state.

## 13. Deferred Decisions

Deferred decisions must be triaged after each version is implemented. Current triage:

| Decision | Status | Current direction |
|---|---|---|
| Should `runtime` own skill file loading itself, or only skill application after CLI/session loads skills? | deferred | v0.4.0 moves skill application to runtime; file loading can stay in CLI/session composition until a concrete runtime embedder needs otherwise. |
| Should core tools all move into `runtime` in v0.4.0, or should v0.4.0 first move only the tool execution path? | implemented | v0.4.0 scope moves core tool execution and default tool definitions to runtime, while policy redesign stays in v0.6.0. |
| Should MCP live in a separate package or inside `runtime`? | implemented | MCP implementation lives under `packages/runtime/src/mcp/` as a tool provider source; no sibling `packages/mcp` package unless future dependency pressure proves it necessary. |
| Should the execution package be named `runtime` or `runner`? | implemented | Keep package name `runtime`; use `runner` for the internal one-run executor (`AgentRunner`). `sandbox` / `environment` name code execution environments, and `workflow` names outer orchestration. |
| Should `CanonicalAgentEvent` be persisted in the same session JSON or a sidecar JSONL? | planned | Decide in v0.7.0 when source events are introduced. |
| Does replay require workspace snapshotting in v0.7.0, or only command/tool output replay first? | planned | Start with command/tool output replay; workspace snapshots require separate storage pressure. |
| Should v0.8.0 prioritize programmatic scorers over LLM judges? | implemented | Programmatic scorers first, LLM judge second. |
| When does JSON storage become insufficient enough to justify SQLite? | planned | Keep JSON until replay/query/concurrency pressure is real. |
