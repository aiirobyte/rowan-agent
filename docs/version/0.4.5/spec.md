# Rowan v0.4.5 Spec

Last updated: 2026-05-21
Status: Planned

## Version Goal

Refactor the Agent loop into a phase-configured engine: `runAgentLoop()` should execute one rigid base `runPhase()` implementation repeatedly, while route, plan, execute, verify, direct-answer, thread, retry, and stop behavior lives in phase definitions.

v0.4.5 is inserted before v0.5.0 because context projection and provider IR should build on a loop whose control flow is already data-driven by phase definitions instead of hard-coded phase branches.

Target shape:

```text
Agent.run()
  -> runAgentLoop(input)

runAgentLoop()
  -> create loop runtime
  -> load AgentPhaseConfig
  -> currentPhaseId = config.entryPhaseId
  -> while currentPhaseId:
       runPhase(definition, runtime)
       apply returned transition
  -> complete AgentRunResult

AgentPhaseDefinition
  -> builds phase input
  -> chooses model context phase
  -> parses model output
  -> applies phase-specific effects
  -> returns next phase or stop/outcome
```

## Why This Version Exists

The current loop has already moved provider normalization and default tool execution toward the right package boundaries, but the loop still has phase-specific branches:

- route is treated as a special first decision;
- direct answer, thread route, planning, execution, verification, retries, and no-verify completion are hard-coded in `packages/agent/src/loop.ts`;
- `packages/agent/src/loop/phases.ts` exposes a generic `runPhase()` wrapper, but callers still provide phase-specific runners and loop-owned branching;
- `AgentRunStatus`, `PhaseInputMap`, and `PhaseOutputMap` encode the current built-in phases as compile-time loop structure rather than configurable phase definitions.

This keeps the loop shallow in the wrong place. Future context projection, provider IR, policy, replay, and workflow orchestration should be able to add or reorder phases by defining phase behavior, not by editing the loop's control-flow branches.

## Core Behavior

- The loop owns one algorithm:
  - emit run/thread/chat lifecycle events;
  - maintain `AgentState`, transcript, limits, attempts, current task, and outcome;
  - execute the configured current phase through the base `runPhase()` runner;
  - follow the returned phase transition;
  - complete exactly one `AgentRunResult`.
- Phase definitions own specialization:
  - how to build the model/runtime input for a phase;
  - how to parse typed phase output or fallback structured output;
  - how to request construction of one child Agent run when the phase needs delegated thread work;
  - which events/messages/state mutations to publish;
  - which next phase to select;
  - how to produce an `Outcome` or stop the loop.
- Built-in route/plan/execute/verify/thread behavior is re-expressed as default phase definitions, not as special branches in `runAgentLoop()`.
- A configurable phase module provides a default phase config and a safe override path for tests and future runtimes.
- `route` can remain the default entry phase, but it is no longer special to the loop. It is just the first configured phase whose definition can return:
  - `next: "plan"`;
  - `next: "thread"`;
  - `next: "stop"` with a direct `Outcome`;
  - another configured phase id.
- `execute` and `verify` are no longer hard-coded loop blocks. Attempt and retry decisions belong to the built-in phase definitions.
- `verifyTasks: false` becomes configuration that changes phase transitions, not a loop-level branch.

## Scope

### In Scope

- Add a phase configuration module under `packages/agent/src/loop/`.
- Define an `AgentPhaseDefinition` contract for built-in and configured phases.
- Define an `AgentPhaseTransition` contract for `next`, `stop`, and abort/outcome behavior.
- Implement a single base `runPhase()` path that handles:
  - abort checks;
  - before/after phase runtime hooks;
  - model stream collection;
  - typed phase output fallback handling;
  - retry caps for runtime hook retries;
  - phase-defined effects and transitions.
- Move route-specific scheduling into the route phase definition.
- Move plan task creation into the plan phase definition.
- Move tool execution and task output creation into the execute phase definition.
- Move verification events, verification parsing, and retry/pass/fail transitions into the verify phase definition.
- Move thread route behavior into a thread phase definition that uses `runPhase()`'s phase-local `createRun` capability, so `runAgentLoop()` does not branch on `route === "thread"` and no standalone nested-run helper remains.
- Replace hard-coded `AgentRunStatus` values with a generic current phase/status representation.
- Add tests that prove the loop executes configured phases without knowing route/plan/execute/verify names.
- Update READMEs and architecture docs to describe phase-configured Agent loop ownership.

### Out Of Scope

- No v0.5.0 context projection or provider IR implementation.
- No movement of Agent loop ownership into `packages/runtime`.
- No public workflow graph engine.
- No replay, fork, compaction, or eval implementation.
- No migration of durable SessionManager storage.
- No compatibility shim that preserves the old hard-coded loop branches.

## Architecture

### Ownership

```text
packages/agent/src/loop.ts
  -> lifecycle wrapper around the generic phase engine
  -> creates runtime, starts/ends chat, handles final completion and errors

packages/agent/src/loop/phase-config.ts
  -> AgentPhaseDefinition
  -> AgentPhaseConfig
  -> default phase config factory
  -> config validation

packages/agent/src/loop/phases.ts
  -> single base runPhase implementation
  -> before/after phase hooks
  -> phase-local createRun capability for one child Agent run
  -> stream collection
  -> output parsing handoff
  -> effect application handoff
  -> transition return

packages/agent/src/loop/built-in-phases.ts
  -> built-in route, plan, execute, verify, and thread definitions
  -> all current phase-specific semantics

packages/agent/src/loop.ts
  -> generic phase-machine loop
  -> mutable live runtime state and generic phase state fields
  -> event/message lifecycle helpers

packages/agent/src/loop/routing.ts
  -> route scheduling helper used only by the route phase definition

packages/agent/src/loop/thread.ts
  -> thread helpers used only by the thread phase definition
```

### Phase Definition Contract

The exact names can be adjusted during implementation, but the contract should preserve this shape:

```ts
export type AgentPhaseTransition =
  | { type: "next"; phaseId: string }
  | { type: "stop"; outcome: Outcome }
  | { type: "abort"; outcome: Outcome };

export type AgentPhaseDefinition<TInput = unknown, TOutput = unknown> = {
  id: string;
  modelPhase?: LlmPhase;
  buildInput(runtime: AgentLoopRuntime): TInput;
  run?: (context: AgentPhaseContext, input: TInput) => Promise<TOutput>;
  parseOutput?(raw: BasePhaseCollectedOutput, input: TInput): TOutput;
  apply?(runtime: AgentLoopRuntime, output: TOutput, input: TInput): Promise<AgentPhaseTransition>;
};

export type AgentPhaseContext = AgentLoopContext & {
  createRun(input: AgentPhaseChildRunInput): Promise<Extract<AgentRunResult, { kind: "thread" }>>;
};
```

The base `runPhase()` implementation should not know whether a phase is route, plan, execute, or verify. It only calls the definition hooks in order.

Thread/delegation behavior should use the phase context's `createRun` capability instead of a separate nested thread helper. Because a child Agent run is constructed inside exactly one phase, the construction path belongs to `runPhase()`'s phase context.

### Default Built-in Phase Graph

```text
route
  -> direct answer: stop(outcome)
  -> task route: plan
  -> thread route: thread

thread
  -> stop(outcome)

plan
  -> execute

execute
  -> verify when verification is enabled
  -> stop(outcome) when verification is disabled

verify
  -> stop(outcome) when passed
  -> execute when failed and attempts remain
  -> stop(outcome) when failed and attempts exhausted
```

This graph belongs to built-in phase definitions and default config, not to `runAgentLoop()`.

## Testing

Required verification:

```bash
bun test packages
bun run build
git diff --check
```

Focused tests:

- A custom three-phase config runs in declared order and completes with an `Outcome`.
- `runAgentLoop()` no longer imports or branches on `routePhase`, `planPhase`, `executePhase`, or `verifyPhase`.
- Default phase config preserves direct answer behavior.
- Default phase config preserves task plan -> execute -> verify behavior.
- Default phase config preserves `verifyTasks: false` behavior through phase transitions.
- Default phase config preserves execute/verify retry behavior and max attempt exhaustion.
- Default phase config preserves thread route behavior and thread depth limits.
- Runtime `beforePhase` / `afterPhase` hooks still adjust, skip, retry, and abort configured phases.
- Invalid execute and verify schema handling remains attached to the relevant phase definition.
- Tool events and tool result messages keep the existing ordering.

## Acceptance

- `docs/version/0.4.5/` contains spec, prompt plan, and todo files.
- Root docs point to v0.4.5 as the active version inserted before v0.5.0.
- The loop has one generic base `runPhase()` execution path.
- Child/thread Agent run construction is phase-local through `runPhase()` and does not use a separate nested-run helper.
- Phase-specific specialization lives in phase definitions.
- Built-in phase behavior is configured through a default `AgentPhaseConfig`.
- External callers can provide or extend phase config without editing `runAgentLoop()`.
- Existing route, direct answer, task execution, verification, retry, limits, thread, multi-turn, invalid schema, and invalid tool args tests still pass.
- `bun test packages` passes.
- `bun run build` passes.
- `git diff --check` passes.
