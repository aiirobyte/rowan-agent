# Rowan v0.4.6 Spec

Last updated: 2026-05-25
Status: Planned

## Version Goal

Refactor the Agent loop phase system: rename "route" to "chat" as the conversational entry phase, co-locate phase prompts with phase definitions, simplify routing heuristics, thread as phase-internal capability, and rename `LlmPhase` to `LoopPhase`.

v0.4.6 builds on v0.4.5's phase-configured engine. The loop now treats the entry phase as a configurable chat phase that sees available phases and routes dynamically, rather than a hard-coded routing decision with pre-set `plan → execute → verify` flow.

## Why This Version Exists

The current loop (v0.4.5) has phase-configured execution, but several problems remain:

- The entry phase is called "route" and the prompt pre-assumes `plan → execute → verify` flow
- Thread is a phase in the phase machine, but it should be a phase-internal capability
- Phase prompts are centralized in `harness/context/prompt.ts` instead of co-located with phase definitions
- `routing.ts` has 137 lines of fragile regex heuristics for routing classification
- `LlmPhase` naming is inaccurate — these are loop phases, not LLM phases
- `AgentRunStatus` is redundant when the current phase ID already indicates status

## Core Behavior

### Init Phase

Entry phase is determined by `AgentPhaseConfig.entryPhaseId`. The engine reads this from config, not from hard-coded values. The init phase (typically "chat") sees available phases and routes dynamically.

### Phase Definition

```typescript
type PhaseDefinition = {
  id: string;
  name: string;
  description: string;       // for init phase LLM to understand available phases
  modelPhase?: LoopPhase;
  buildInput(runtime: AgentLoopRuntime): unknown | Promise<unknown>;
  run?(context: PhaseContext, input: unknown): Promise<unknown>;
  parseOutput?(raw: unknown, input: unknown): unknown;
  apply?(runtime: AgentLoopRuntime, output: unknown, input: unknown): Promise<PhaseTransition>;
};
```

### Phase Transition

```typescript
type PhaseTransition =
  | { type: "next"; phaseId: string }
  | { type: "stop"; outcome: Outcome }
  | { type: "abort"; outcome: Outcome };
```

### PhaseOutput (generic)

```typescript
type PhaseOutput = {
  route: "direct" | string;  // "direct" stops, or a phase ID
  message: string;
  text: string;
};
```

### Thread as Phase-Internal Capability

Thread is neither a phase nor a tool. It is a special capability that phases can invoke internally via `context.createRun()`. Thread input/output stays within the calling phase.

```typescript
type PhaseContext = AgentLoopContext & {
  createRun?: RunThread;  // optional, only for phases that need thread
};
```

### Runtime State

- `AgentRunStatus` deleted, replaced by `runtime.currentPhase: string`
- `lastChatDecision` deleted
- `LlmPhase` renamed to `LoopPhase`

## Scope

### In Scope

- Rename `LlmPhase` to `LoopPhase` across the codebase
- Rename entry phase from "route" to "chat"
- Create phase module structure under `loop/phases/` with co-located prompts
- Move phase prompts from `harness/context/prompt.ts` to respective phase modules
- Simplify chat phase routing (2 safety checks only, no regex heuristics)
- Delete `routing.ts`, `thread.ts`, `built-in-phases.ts`
- Thread as phase-internal capability (not phase, not tool)
- Update protocol types: delete `RoutingDecision`, delete `ThreadTaskOutput`
- Update `AgentPhaseDefinition` with `name` and `description` fields
- `DEFAULT_PHASE_ID` replaces `DEFAULT_PHASE_IDS`
- Update all downstream consumers (engine, logging, CLI, tests)

### Out Of Scope

- No v0.5.0 context projection or provider IR
- No new phase definitions beyond chat/plan/execute/verify
- No workflow graph engine
- No replay, fork, compaction, or eval implementation
- No migration of durable SessionManager storage

## Architecture

### Phase Module Structure

```text
loop/phases/
  index.ts                 # re-exports + createBuiltinPhaseConfig
  types.ts                 # PhaseDefinition, PhaseContext, PhaseTransition, PhaseOutput
  chat/
    index.ts               # chatPhaseDefinition
    types.ts               # ChatInput
    prompt.ts              # buildChatPrompt
  plan/
    index.ts
    types.ts
    prompt.ts
  execute/
    index.ts
    types.ts
    prompt.ts
  verify/
    index.ts
    types.ts
    prompt.ts
```

### Ownership

```text
packages/agent/src/protocol/phase.ts
  -> LoopPhase type definition

packages/agent/src/protocol/context.ts
  -> LoopPhaseOutputMap, LlmContext

packages/agent/src/protocol/task.ts
  -> Task, VerificationResult, Outcome (no RoutingDecision, no ThreadTaskOutput)

packages/agent/src/loop/phases/
  -> PhaseDefinition, PhaseContext, PhaseTransition, PhaseOutput
  -> Phase modules with co-located prompts

packages/agent/src/loop/phases.ts
  -> Phase execution engine (runConfiguredPhase)
  -> Generic stream collection (collectTextAndStructured)

packages/agent/src/loop/phase-config.ts
  -> AgentPhaseConfig, DEFAULT_PHASE_ID

packages/agent/src/loop.ts
  -> Lifecycle wrapper, runtime, loop iteration

packages/agent/src/harness/context/prompt.ts
  -> buildSystemPrompt only (no phase-specific prompts)

packages/agent/src/harness/context/prompt-builder.ts
  -> Prompt assembly, imports from phase modules
```

### Default Phase Graph

The default config uses "chat" as entry phase. The chat phase sees available phases and routes dynamically.

```text
chat
  -> direct: stop(outcome)
  -> <phase-id>: transition to that phase

plan
  -> execute

execute
  -> verify

verify
  -> stop(outcome) when passed
  -> execute when failed and attempts remain
  -> stop(outcome) when failed and attempts exhausted
```

Thread creation happens inside phase `apply` functions via `context.createRun()`, not as a phase transition.

## Testing

Required verification:

```bash
npx tsc --noEmit
bun test packages/agent/test/
bun test packages/logging/test/
bun test packages/cli/test/
```

## Acceptance

- `LoopPhase = "chat" | "plan" | "execute" | "verify"`
- `routing.ts` deleted
- `thread.ts` deleted
- `built-in-phases.ts` deleted
- `RoutingDecision` type deleted
- `ThreadTaskOutput` type deleted
- Phase prompts co-located with phase definitions
- `harness/context/prompt.ts` contains only `buildSystemPrompt`
- Chat phase sees available phases and routes dynamically
- Thread is phase-internal capability, not a phase or tool
- Engine reads `entryPhaseId` from config, no hard-coded phase names
- All tests pass
- Type check passes
