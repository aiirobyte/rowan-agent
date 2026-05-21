# @rowan-agent/agent

## Main Features

`@rowan-agent/agent` is the public programming entry point and Agent core for Rowan. It wraps model execution, event subscriptions, tool registration, loop-owned thread delegation, run cancellation, and idle waiting.

The package implements a phase-configured Agent loop. The loop executes a configurable sequence of phase definitions through a single base `runPhase()` runner. Built-in phases (route, thread, plan, execute, verify) preserve the default behavior, while custom phase configurations can extend or replace them.

## Architecture

`src/agent.ts` provides the `Agent` class and remains the core/facade entrypoint. It calls `src/loop.ts` directly.

`src/loop.ts` implements the generic phase-machine loop:
- Creates the loop runtime from input
- Resolves the phase configuration (default built-in or custom)
- Iterates through phases by following transitions (`next`, `stop`, `abort`)
- Completes the run with an `AgentRunResult`

Phase definitions live under `src/loop/`:
- `phase-config.ts` — `AgentPhaseDefinition`, `AgentPhaseConfig`, validation, and default config factory
- `built-in-phases.ts` — built-in route, thread, plan, execute, and verify phase definitions
- `phases.ts` — base `runPhase()` and `runConfiguredPhase()` runners
- `routing.ts` — route scheduling helper used by the route phase
- `thread.ts` — thread execution helper used by the thread phase

Mutable live runtime state and lifecycle helpers live in `src/loop.ts` with the generic phase-machine boundary.

`Agent` keeps a small state object:

- `sessionId` identifies the current live run/session.
- `context` is the current `systemPrompt`, visible messages, tools, and skills snapshot.
- `model` and `stream` describe the model identity and call path.
- `tools` are the tools the runtime may expose to the model.
- `isRunning`, `currentResult`, and `error` describe the current run state.

`src/task.ts` and `src/types.ts` expose task helpers, typed protocol phase outputs, `AgentState`, `createAgentState`, `createMessage`, and public Agent types. Runtime-owned core tools are exported by `@rowan-agent/runtime`. `src/index.ts` is the package entry point.

The loop consumes adapter-normalized `phase_output` events from `@rowan-agent/protocol` while still accepting `structured_output` events for local scripted streams. Default tool calls are executed through the event-neutral runtime primitive; `agent` translates runtime observations into ordered `AgentEvent`s, conversation messages, attempts, verification, and final `AgentRunResult`.

`Agent` intentionally exposes the stable, application-facing run surface: context, model, stream, limits, session id, tool approval hooks, event subscriptions, and cancellation. Durable Session persistence belongs to composition roots through `@rowan-agent/session` contracts, not to `Agent`.

## Usage Flow

1. Prepare `model`, `stream`, and `tools`. Optionally provide skills, limits, and tool approval hooks.
2. Create an `Agent` instance.
3. Use `subscribe` to listen to events. Logging modules and UIs can both consume this stream.
4. Call `run()` with an `AgentRunConfig.context` snapshot to start or continue a conversation turn.
5. Pass a loaded `sessionId` and reconstructed context before continuing an existing session, or call `abort()` to stop the current run.

```ts
import { Agent } from "@rowan-agent/agent";
import { createMessage } from "@rowan-agent/agent";
import { createCoreTools } from "@rowan-agent/runtime";

const tools = createCoreTools({ root: process.cwd() });
const agent = new Agent({
  context: {
    systemPrompt: "You are Rowan.",
    messages: [
      createMessage("user", "list the package structure in this project"),
    ],
    tools,
  },
  model: { provider: "openai-compatible", name: "gpt-4.1-mini" },
  stream,
});

agent.subscribe((event) => {
  console.error(event.type);
});

const result = await agent.run();
console.log(result.outcome.message);
```
