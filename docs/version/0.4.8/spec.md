# Rowan v0.4.8 Spec

Last updated: 2026-05-28
Status: Planned

## Version Goal

Refactor the Agent loop lifecycle so that:

1. **All phases share a unified input/output interface.** PhaseInput contains `systemPrompt`, `messages`, `tools`, `skills`, and `yield` (data from the previous phase). PhaseOutput contains `message`, `route`, and `yield` (data for the next phase).

2. **The model decides routing through `route`.** Each phase's prompt tells the model what routes are available. The model outputs `route: "stop"` or `route: "<phase_id>"`. The main loop reads `route` and follows it. No phase-specific routing logic.

3. **Phase-specific data flows through `yield`.** Plan yields `{ task }`. Execute yields `{ toolResults }`. Verify receives toolResults via `input.yield`. No data leaks into AgentState.

4. **Message and tool execution have streaming lifecycles.** `PhaseContext` exposes `message.start/update/end` and `toolExecution.start/update/end`. `appendMessage` no longer auto-emits events.

5. **Events align with pi's turn model.** `chat_start`/`chat_end` renamed to `turn_start`/`turn_end`. Phase is an internal concept within a turn.

## Why This Version Exists

The current lifecycle has several design problems:

### 1. Phase outputs are not unified

Each phase returns a different type:

```text
chat:    { route, message, text }
plan:    { task, text }
execute: { text, toolCalls }
verify:  { passed, message }
```

The main loop needs phase-specific logic to interpret each output. `applyOutput` is scattered across phase handlers, mixing routing decisions with side effects.

### 2. Phase-specific data leaks into AgentState

`AgentState` contains `task` and `goal`, which are plan phase outputs, not agent-level persistent state. They should flow between phases through `yield`.

### 3. Messages lack streaming lifecycle

`appendMessage` synchronously emits `message_start` + `message_end` with no streaming window. `collectTextAndStructured` bypasses phase control by calling `appendMessage` directly. Tool execution events are emitted inside `executeToolCall`'s `observe` callback, invisible to the phase.

### 4. Event naming doesn't align with pi

`chat_start`/`chat_end` is semantically vague. Pi uses `turn_start`/`turn_end` for the same concept.

## Core Behavior

### Unified Phase Interface

```typescript
type PhaseInput = {
  systemPrompt: string;
  messages: AgentMessage[];
  tools: Tool[];
  skills: Skill[];
  yield?: unknown;
};

type PhaseOutput = {
  message: string;
  route: string;
  yield?: unknown;
};
```

Every phase receives the same input shape. Every phase returns the same output shape. Phase-specific data flows through `yield`.

### Model-Driven Routing

Each phase's prompt defines available routes:

```text
chat:    route = "stop" | "<phase_id>"
plan:    route = "execute"
execute: route = "execute" | "verify"
verify:  route = "stop" | "execute"
```

The model chooses the route. The main loop follows it. No `applyOutput`, no `PhaseTransition`, no phase-specific routing logic in the loop.

### Main Loop

```text
runLoop(runtime)
  config = runtime.phaseConfig ?? createBuiltinPhaseConfig()
  currentPhaseId = config.entryPhaseId
  lastYield = undefined
  phaseVisits = {}

  while currentPhaseId:
    handler = getPhaseHandler(currentPhaseId)

    // Generic visit limit
    visits = phaseVisits[currentPhaseId]++
    if visits > handler.conversationLimit -> stop

    // Build unified input
    input = handler.buildInput(context, lastYield)

    // Lifecycle hooks
    beforePhase -> skip/abort/modify

    // Run phase
    phase_start
    output = definition.run(context, input)
    afterPhase -> abort/retry/modify
    handler.finalize(context, output)
    phase_end

    // Read route
    if output.route == "stop"
      outcome = handler.createOutcome(output, state) ?? default
      return completeRun(outcome)

    // Pass yield to next phase
    lastYield = output.yield
    currentPhaseId = output.route
```

### PhaseContext Lifecycle Managers

```typescript
type PhaseContext = {
  // ... existing capabilities ...

  message: {
    start(role, content, metadata): string;
    update(messageId, delta): Promise<void>;
    end(messageId): Promise<void>;
  };

  toolExecution: {
    start(toolCallId, toolName, args): Promise<void>;
    update(toolCallId, partialResult): Promise<void>;
    end(toolCallId, toolName, result, isError): Promise<void>;
  };
};
```

Phases use these to emit lifecycle events. `appendMessage` becomes a pure data append with no event emission.

### AgentState Cleanup

Remove `task` and `goal` from AgentState. These flow through `yield`:

```text
plan.run()    -> yield: { task }
execute.run() -> input.yield = { task }  -> yield: { toolResults }
verify.run()  -> input.yield = { toolResults }
```

### Event Renaming

`chat_start` -> `turn_start`
`chat_end` -> `turn_end`

### PhaseHandler Simplified

```typescript
type PhaseHandler = {
  definition: PhaseDefinition;
  conversationLimit?: number;
  prepare?(context: PhaseContext): void;
  buildInput(context: PhaseContext, yield?: unknown): PhaseInput;
  buildPrompt?(input: PhaseInput): string;
  finalize?(context: PhaseContext, output: PhaseOutput): void;
  createOutcome?(output: PhaseOutput, state: AgentRunState): Outcome;
};
```

From 7 methods to 5. No `applyOutput`. No generic type parameters.

## Scope

### In Scope

- Unified `PhaseInput`/`PhaseOutput` types with `yield` field.
- Remove `LoopPhaseOutputMap`, `PhaseOutputMap`, `PhaseInputMap`, `ExecuteOutput`.
- Remove `applyOutput` from PhaseHandler.
- Add `createOutcome` to PhaseHandler (optional).
- Main loop reads `output.route` for transitions.
- Generic `phaseVisits` limit using existing `conversationLimit`.
- `PhaseContext` message lifecycle manager (`start`/`update`/`end`).
- `PhaseContext` tool execution lifecycle manager (`start`/`update`/`end`).
- `appendMessage` removes auto event emission.
- `collectTextAndStructured` uses `PhaseContext.message`.
- `executeToolCall` removes `observe` callback for events.
- Execute phase uses `PhaseContext.toolExecution`.
- Rename `chat_start`/`chat_end` to `turn_start`/`turn_end`.
- `emitChat` -> `emitTurn`.
- Remove `task`/`goal` from `AgentState`.
- Phase-specific data flows through `yield` instead of `AgentState`.
- `LlmContext` union type replaced by unified `PhaseInput` in `buildPrompt`.
- Update all tests for new event names and output format.

### Out Of Scope

- No new phase IDs beyond `chat`, `plan`, `execute`, and `verify`.
- No v0.5.0 context projection or provider IR.
- No workflow graph engine.
- No replay, fork, compaction, or eval implementation.
- No durable SessionManager migration.
- No changes to `AgentState.version` (persistence concern, separate PR).
- No changes to `AgentState.id`, `parentSessionId`, `systemPrompt`, `messages`, `skills`, `input`, `createdAt`, `updatedAt`, `title`.

## Architecture

### Data Flow

```text
plan.run(context, input)
  -> model outputs { message, route: "execute", task }
  -> return { message, route: "execute", yield: { task } }

main loop: lastYield = output.yield

execute.buildInput(context, lastYield)
  -> input.yield = { task }
execute.run(context, input)
  -> model outputs { message, route: "verify", toolCalls }
  -> execute tool calls via context.toolExecution
  -> return { message, route: "verify", yield: { toolResults } }

main loop: lastYield = output.yield

verify.buildInput(context, lastYield)
  -> input.yield = { toolResults }
verify.run(context, input)
  -> model outputs { message, route: "stop" }
  -> return { message, route: "stop" }

main loop: handler.createOutcome(output, state) -> completeRun
```

### Module Changes

```text
packages/agent/src/types.ts
  -> AgentEvent: chat_start -> turn_start, chat_end -> turn_end
  -> AgentState: remove task, goal

packages/agent/src/protocol/context.ts
  -> Remove LoopPhaseOutputMap
  -> Add unified PhaseOutput with yield

packages/agent/src/agent-loop.ts
  -> emitChat -> emitTurn
  -> appendMessage: remove auto event emission
  -> collectTextAndStructured: use PhaseContext.message
  -> executeToolCall: remove observe callback
  -> createPhaseContext: implement message/toolExecution managers
  -> runLoop: read output.route, pass yield, phaseVisits limit

packages/agent/src/loop/phases/config.ts
  -> PhaseContext: add message/toolExecution managers
  -> Remove PhaseTransition from exports

packages/agent/src/loop/phases/built-in/types.ts
  -> PhaseHandler: remove applyOutput, add createOutcome
  -> Remove generic type parameters

packages/agent/src/loop/phases/built-in/chat/index.ts
  -> Unified PhaseInput/PhaseOutput
  -> applyOutput -> finalize + createOutcome

packages/agent/src/loop/phases/built-in/plan/index.ts
  -> Unified PhaseInput/PhaseOutput
  -> yield: { task }
  -> applyOutput -> finalize

packages/agent/src/loop/phases/built-in/execute/index.ts
  -> Unified PhaseInput/PhaseOutput
  -> yield: { toolResults }
  -> Use PhaseContext.toolExecution
  -> applyOutput -> finalize

packages/agent/src/loop/phases/built-in/verify/index.ts
  -> Unified PhaseInput/PhaseOutput
  -> Remove VerificationResult as output type
  -> input.yield = { toolResults }
  -> applyOutput -> createOutcome
```

## Testing

Required verification:

```bash
bun test packages/agent/test/agent-loop.test.ts
bun test packages/agent/test/agent-multiturn.test.ts
bun test packages/agent/test/thread.test.ts
bun test packages/agent/test/
bun run build
git diff --check
```

Targeted assertions:

- All phases return `{ message, route, yield? }`.
- Main loop reads `output.route` for transitions, no phase-specific routing logic.
- `yield` flows from one phase's output to the next phase's input.
- `message_start` -> `message_update*` -> `message_end` sequence is emitted during streaming.
- `tool_execution_start` -> `tool_execution_end` is emitted for each tool call.
- `turn_start` and `turn_end` events are emitted (not `chat_start`/`chat_end`).
- `appendMessage` does not emit events.
- Phase visit limit stops infinite loops.
- Direct chat, plan, execute, verify, retry, and max-attempt flows still work.
- Thread (nested) flows still work.

## Acceptance

- All phase outputs are `PhaseOutput = { message, route, yield? }`.
- All phase inputs are `PhaseInput = { systemPrompt, messages, tools, skills, yield? }`.
- `LoopPhaseOutputMap`, `PhaseOutputMap`, `PhaseInputMap`, `ExecuteOutput` are removed.
- `PhaseHandler` has no `applyOutput` method.
- `PhaseHandler` has optional `createOutcome` method.
- Main loop contains no phase-specific routing logic.
- `output.route` is the single source of truth for transitions.
- `yield` carries phase-specific data between phases.
- `AgentState` no longer contains `task` or `goal`.
- `PhaseContext` exposes `message.start/update/end` and `toolExecution.start/update/end`.
- `appendMessage` does not emit `message_start`/`message_end`.
- `collectTextAndStructured` uses `PhaseContext.message`.
- `executeToolCall` does not emit `tool_execution_start`/`tool_execution_end` via `observe`.
- Events use `turn_start`/`turn_end` (not `chat_start`/`chat_end`).
- `emitChat` is renamed to `emitTurn`.
- `LlmContext` union type is removed; `buildPrompt` takes `PhaseInput`.
- Existing user-visible Agent loop behavior is preserved.
- Required tests and build pass.
