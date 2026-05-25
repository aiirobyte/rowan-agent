# Rowan v0.4.7 Spec

Last updated: 2026-05-25
Status: Planned

## Version Goal

Refactor the Agent loop phase module so phase definitions are pure phase mechanisms: `phase input + PhaseContext capabilities -> phase output`.

The runtime path should be:

```text
runLoop
  -> build context, messages, and phase input
  -> runPhase configured phase mechanism
  -> call phase definition
  -> receive phase output
  -> apply output in runLoop
```

v0.4.7 builds on the v0.4.6 phase module shape (`chat`, `plan`, `execute`, `verify`, co-located prompts, and configurable phase definitions), but corrects the boundary: phase definitions should not import `AgentLoopRuntime`, mutate loop state, or decide loop execution transitions directly.

## Why This Version Exists

The current phase module still mixes phase behavior with loop execution details:

- `PhaseDefinition.buildInput(runtime)` exposes `AgentLoopRuntime` to every phase.
- `PhaseDefinition.apply(runtime, output, input)` lets phase definitions mutate loop state and decide transitions.
- Built-in phase implementations import `../../../../loop` for helpers such as `appendAssistantMessage`.
- `chat`, `plan`, `execute`, and `verify` contain runtime details such as `currentTask`, `attempt`, `toolResults`, and stop/next transition rules.
- The current configured phase runner owns part of the loop runtime by applying hooks, emitting phase events, merging retry input, and translating definition output into transitions.

That shape makes phases too powerful. A phase should process one input using the capabilities exposed by its context, then return a typed output. The loop should own runtime state, lifecycle events, retries, and phase-to-phase execution.

## Core Behavior

### Phase Boundary

`runLoop()` owns loop execution:

- resolve the active `AgentPhaseConfig`
- select the current phase definition
- build the phase input from runtime state
- build a constrained `PhaseContext`
- run the configured phase mechanism
- apply the phase output to runtime state
- choose the next phase or final outcome

Phase definitions own phase behavior:

- accept already-built input
- call `PhaseContext` capabilities for model, messages, tools, skills, thread/run creation, limits, and events
- normalize model/tool results into the phase's output type
- return output without mutating loop runtime directly

### Phase Definition

```typescript
type PhaseDefinition<TInput = unknown, TOutput = unknown> = {
  id: string;
  name: string;
  description: string;
  modelPhase?: LoopPhase;
  run(context: PhaseContext, input: TInput): Promise<TOutput>;
};
```

`PhaseDefinition` does not include:

- `buildInput(runtime)`
- `apply(runtime, output, input)`
- direct `AgentLoopRuntime` access
- direct phase transition decisions

Phase-local parsing and normalization can remain inside the phase module, but it must be called from `run()` and return the declared output.

### Phase Context

`PhaseContext` is a capability surface, not the loop runtime:

```typescript
type PhaseContext = {
  phaseId: string;
  state: Readonly<AgentRunState>;
  messages: {
    visible(): AgentMessage[];
    append(message: AgentMessage): Promise<void>;
    appendState(message: AgentMessage): Promise<void>;
  };
  model: {
    collect<TPhase extends LoopPhase>(input: {
      phase: TPhase;
      payload: LlmContext;
      recordText?: boolean;
    }): Promise<CollectedPhaseOutput<TPhase>>;
  };
  tools: {
    execute(input: {
      task: Task;
      toolCall: ToolCall;
    }): Promise<ToolResult>;
  };
  runs: {
    create: RunThread;
  };
  skills: AgentState["skills"];
  emit(event: AgentEvent): Promise<void>;
  consumeLimit(resource: keyof AgentLimitUsage): void;
  signal?: AbortSignal;
};
```

The exact helper names can be adjusted during implementation, but the boundary is fixed: phase code talks to this context, not to `AgentLoopRuntime`.

### Loop-Owned Phase Input

Input construction moves out of phase definitions.

```typescript
type PhaseInputBuilder<TInput = unknown> = {
  phaseId: string;
  build(runtime: AgentLoopRuntime, definition: PhaseDefinition): TInput | Promise<TInput>;
};
```

The built-in phase extensions provide loop-side input builders for:

- `chat`: state, runtime depth, tools, available phases, worker task/goal
- `plan`: state and runtime depth
- `execute`: state, current task, tool results, runtime depth; increments attempts before execution
- `verify`: state, current task, task output, criteria, runtime depth

These builders belong to the loop phase runtime layer, not to phase definitions.

### Loop-Owned Phase Output Application

Output application moves out of phase definitions.

```typescript
type PhaseOutputApplier<TInput = unknown, TOutput = unknown> = {
  phaseId: string;
  apply(input: {
    runtime: AgentLoopRuntime;
    definition: PhaseDefinition<TInput, TOutput>;
    phaseInput: TInput;
    phaseOutput: TOutput;
  }): Promise<PhaseTransition>;
};
```

The built-in phase extensions provide output appliers for:

- `chat`: direct output becomes final outcome; routed output transitions to the selected phase
- `plan`: task output becomes `runtime.currentTask`; next phase is `execute`
- `execute`: tool output updates `runtime.toolResults` and `runtime.lastExecuteText`; next phase is `verify`, or stop if no verify phase exists
- `verify`: passed output stops with success; failed output retries `execute` until attempts are exhausted, then stops with failure

The important rule: transition and runtime mutation belong here, not inside phase definitions.

## Scope

### In Scope

- Replace `PhaseDefinition.buildInput` with loop-owned phase input builders.
- Replace `PhaseDefinition.apply` with loop-owned phase output appliers.
- Remove `AgentLoopRuntime` imports from phase definition modules.
- Keep one configured phase runner path; do not add a second specialized runner.
- Rename the configured phase runner to `runPhase()` and narrow it so it receives `PhaseContext`, `PhaseDefinition`, and already-built input, then returns phase output.
- Move runtime hooks, phase events, retry handling, and transition application into `runLoop()` or loop-owned helpers.
- Move model collection and tool execution behind `PhaseContext` capabilities.
- Keep built-in phases as extension-style modules under `loop/phases/built-in/<phase>/`.
- Update built-in phase definitions so `chat`, `plan`, `execute`, and `verify` only implement input-to-output behavior.
- Remove `loop/phases/builtin-config.ts` as a separate pass-through module; built-in phase extension aggregation belongs in `loop/phases/built-in/index.ts`.
- Remove `loop/phases/prompt-builder.ts`; phase-specific Rendering belongs inside the corresponding built-in phase extension.
- Update tests around phase contracts, loop-owned input/output adapters, and full loop behavior.

### Out Of Scope

- No new phase IDs beyond `chat`, `plan`, `execute`, and `verify`.
- No v0.5.0 context projection or provider IR.
- No workflow graph engine.
- No replay, fork, compaction, or eval implementation.
- No durable SessionManager migration.
- No compatibility layer for the old phase definition shape.
- No deprecated `runConfiguredPhase()` export once `runPhase()` replaces it.

## Architecture

### Target Module Structure

```text
packages/agent/src/loop.ts
  -> runLoop execution owner
  -> current phase selection
  -> lifecycle, retry, transition, and result creation

packages/agent/src/loop/phases/config.ts
  -> AgentPhaseConfig
  -> PhaseDefinition without runtime-facing hooks
  -> generic phase config validation only
  -> config validation

packages/agent/src/loop/phases/context.ts
  -> createPhaseContext(runtime)
  -> model/tool/message/thread/skill capabilities

packages/agent/src/loop/phases/phase.ts
  -> runPhase(context, definition, input)
  -> no AgentLoopRuntime dependency
  -> no transition application

packages/agent/src/loop/phases/built-in/index.ts
  -> built-in extension aggregation
  -> createBuiltinPhaseConfig()
  -> no template-to-implementation indirection

packages/agent/src/loop/phases/built-in/*/
  -> extension-style phase modules
  -> manifest.json metadata and prompt template
  -> pure phase definition
  -> phase input builder
  -> phase output applier
  -> phase-specific Rendering from PhaseInput/PhaseContext to model prompt
  -> context capability usage
  -> no direct runtime import in phase definitions
```

Built-in phase folders stay the source of truth for built-in behavior. A built-in phase module can expose a small extension object, for example:

```typescript
type BuiltinPhaseExtension<TInput = unknown, TOutput = unknown> = {
  manifest: PhaseConfigTemplatePhase;
  definition: PhaseDefinition<TInput, TOutput>;
  buildInput(runtime: AgentLoopRuntime, definition: PhaseDefinition): TInput | Promise<TInput>;
  applyOutput(input: {
    runtime: AgentLoopRuntime;
    definition: PhaseDefinition<TInput, TOutput>;
    phaseInput: TInput;
    phaseOutput: TOutput;
  }): Promise<PhaseTransition>;
};
```

Only the extension's input/output adapter layer may touch `AgentLoopRuntime`. The phase definition inside the extension stays pure.

This consolidation is required. `builtin-config.ts` currently has a shallow Interface: callers still need to understand manifests, implementation maps, templates, and definition assembly. Moving that aggregation into `built-in/index.ts` gives the built-in phase set one local extension registry and removes the template-to-implementation indirection.

`config.ts` remains necessary, but only as the generic configurable phase contract and validation Module. It should not know built-in manifests, prompt templates, built-in implementation IDs, or phase Rendering.

`prompt-builder.ts` is not necessary as a standalone phase Module in v0.4.7. The Agent loop can still expose model/message capabilities through `PhaseContext`, but each phase owns how its phase input and context are rendered for the model.

### Runtime Flow

```text
runLoop(runtime)
  config = runtime.phaseConfig ?? createBuiltinPhaseConfig()
  phaseId = config.entryPhaseId

  while phaseId:
    definition = resolvePhase(config, phaseId)
    runtime.currentPhase = phaseId

    input = buildPhaseInput(runtime, definition)
    context = createPhaseContext(runtime, definition)
    output = runPhase(context, definition, input)
    transition = applyPhaseOutput(runtime, definition, input, output)

    stop/abort -> completeRun(runtime, outcome)
    next -> phaseId = transition.phaseId
```

### Phase Runner

`runPhase()` is the shared configured phase mechanism that invokes a `PhaseDefinition` with a context and input. It is not a separate `runDefaultPhase()` implementation and it does not know `plan`, `execute`, or `verify` semantics.

```text
runPhase
  -> before/after lifecycle has already been handled by runLoop
  -> receive PhaseContext + PhaseDefinition + PhaseInput
  -> call definition.run(context, input)
  -> return typed PhaseOutput
```

### Ownership Rules

- `runLoop()` owns execution order.
- `PhaseInputBuilder` owns runtime-to-input projection.
- `PhaseOutputApplier` owns output-to-runtime mutation and transitions.
- `PhaseDefinition` owns only phase processing.
- `PhaseContext` owns capability access and hides runtime implementation details.
- Built-in phase extension modules own their own manifest, input builder, pure definition, and output applier.
- Built-in phase extension modules own their own phase-specific Rendering.
- `config.ts` owns generic phase config only; it does not assemble built-in phases.
- `built-in/index.ts` owns built-in extension aggregation.
- Protocol types own the shared output contracts.

## Testing

Required verification:

```bash
bun test packages/agent/test/phase-config.test.ts
bun test packages/agent/test/run-configured-phase.test.ts
bun test packages/agent/test/built-in-phases.test.ts
bun test packages/agent/test/
bun run build
git diff --check
```

Targeted assertions:

- A phase definition can run without importing or receiving `AgentLoopRuntime`.
- `runPhase()` receives input and returns output, with no transition side effects.
- `buildPhaseInput()` constructs the expected input for each built-in phase.
- `applyPhaseOutput()` performs the expected runtime mutation and transition for each built-in phase.
- Built-in phase modules do not import `../../../../loop`.
- Full loop behavior still supports direct chat, plan, execute, verify, retry, and max-attempt failure.

## Acceptance

- `PhaseDefinition` no longer exposes `buildInput` or `apply`.
- `PhaseDefinition` no longer references `AgentLoopRuntime`.
- Built-in phase definitions no longer import `../../../../loop`.
- Built-in phase behavior is registered through extension-style modules under `built-in/<phase>/`.
- `builtin-config.ts` is removed or folded into `built-in/index.ts`.
- `prompt-builder.ts` is removed as a standalone phase module; phase Rendering is local to each phase extension.
- `runConfiguredPhase()` is replaced by `runPhase()`.
- `runPhase()` returns phase output, not `PhaseTransition`.
- Runtime hooks, phase events, retry handling, and transition application are loop-owned.
- Phase input construction is loop-owned and supplied by the built-in phase extension adapter.
- Phase output application is loop-owned and supplied by the built-in phase extension adapter.
- `PhaseContext` exposes model, tools, messages, runs/thread, skills, events, limits, and abort signal as capabilities.
- Built-in phases only perform input-to-output phase work.
- Old phase definition APIs are removed without compatibility shims.
- Existing user-visible Agent loop behavior is preserved.
- Required tests and build pass.
