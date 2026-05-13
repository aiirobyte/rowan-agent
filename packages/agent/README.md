# @rowan-agent/agent

## Main Features

`@rowan-agent/agent` is the public programming entry point and Agent core for Rowan. It wraps model execution, event subscriptions, tool registration, loop-owned thread delegation, run cancellation, and idle waiting.

The package also owns the route, plan, execute, verify, thread, retry, outcome, and execution-turn recording flow. Most application code can depend on `@rowan-agent/agent` alone to create an interactive agent.

## Architecture

`src/agent.ts` provides the `Agent` class and remains the core/facade entrypoint. It calls `src/loop.ts` directly, and the loop owns both normal sessions and child thread sessions. Phase helpers live under `src/phases/`. The loop materializes the run `context` into session messages; composition roots such as the CLI persist returned sessions and optional execution steps.

`Agent` keeps a small state object:

- `session` is the current conversation session.
- `context` is the current `systemPrompt`, visible messages, tools, and skills snapshot.
- `model` and `stream` describe the model identity and call path.
- `tools` are the tools the runtime may expose to the model.
- `isRunning`, `currentResult`, and `error` describe the current run state.

`src/task.ts` and `src/types.ts` expose task helpers, typed protocol phase outputs, and public Agent types. Runtime-owned core tools are exported by `@rowan-agent/runtime`. `src/index.ts` is the package entry point.

The loop consumes adapter-normalized `phase_output` events from `@rowan-agent/protocol` while still accepting legacy `structured_output` events for local scripted streams. Default tool calls are executed through the event-neutral runtime primitive; `agent` translates runtime observations into ordered `AgentEvent`s, session messages, execution turns, attempts, verification, and final `AgentRunResult`.

`Agent` intentionally exposes the stable, application-facing run surface: context, model, stream, limits, sessions, tool approval hooks, event subscriptions, cancellation, and optional step recording. Advanced phase/runtime ports are internal to the low-level loop API and should be tested or customized through `runAgentLoop`, not through `AgentRunConfig`.

## Usage Flow

1. Prepare `model`, `stream`, and `tools`. Optionally provide skills, limits, tool approval hooks, and a `recordStep` callback for observability/persistence.
2. Create an `Agent` instance.
3. Use `subscribe` to listen to events. Logging modules and UIs can both consume this stream.
4. Call `run()` with an `AgentRunConfig.context` snapshot to start or continue a conversation turn.
5. Pass a loaded `session` in `AgentRunConfig` before continuing an existing session, or call `abort()` to stop the current run.

```ts
import { Agent } from "@rowan-agent/agent";
import { createCoreTools } from "@rowan-agent/runtime";
import { createMessage } from "@rowan-agent/session";

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
