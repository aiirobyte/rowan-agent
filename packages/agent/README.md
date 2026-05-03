# @rowan-agent/agent

## Main Features

`@rowan-agent/agent` is the public programming entry point and Agent core for Rowan. It wraps session lifecycle management, model execution, event subscriptions, tool registration, thread startup, persistent storage, run cancellation, and idle waiting.

The package also owns the route, plan, execute, verify, thread, retry, outcome, and execution-turn recording flow. Most application code can depend on `@rowan-agent/agent` alone to create an interactive agent.

## Architecture

`src/agent.ts` provides the `Agent` class and remains the core/facade entrypoint. It calls `src/loop.ts` directly, uses `src/thread.ts` for child sessions, and keeps phase helpers under `src/phases/`. `@rowan-agent/session` creates or appends user messages, and an optional `AgentStore` from `@rowan-agent/store` persists sessions and execution steps.

`Agent` keeps a small state object:

- `session` is the current conversation session.
- `model` and `stream` describe the model identity and call path.
- `tools` are the tools the runtime may expose to the model.
- `isRunning`, `currentOutcome`, and `error` describe the current run state.

`src/task.ts`, `src/tools.ts`, and `src/types.ts` expose task helpers, runtime-backed core tools, and public Agent types. `src/index.ts` is the package entry point.

## Usage Flow

1. Prepare `model`, `stream`, and `tools`. Optionally provide an `AgentStore`, skills, budgets, and tool approval hooks.
2. Create an `Agent` instance.
3. Use `subscribe` to listen to events. Logging modules and UIs can both consume this stream.
4. Call `prompt(input)` to start or continue a conversation turn.
5. Call `loadSession(sessionId)` before continuing an existing session, or `abort()` to stop the current run.

```ts
import { Agent, createCoreTools } from "@rowan-agent/agent";

const agent = new Agent({
  systemPrompt: "You are Rowan.",
  model: { provider: "openai-compatible", name: "gpt-4.1-mini" },
  stream,
  tools: createCoreTools({ root: process.cwd() }),
});

agent.subscribe((event) => {
  console.error(event.type);
});

const outcome = await agent.prompt("list the package structure in this project");
```
