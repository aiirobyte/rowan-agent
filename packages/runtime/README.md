# @rowan-agent/runtime

## Main Features

`@rowan-agent/runtime` is Rowan's execution kernel. It runs the route, plan, execute, and verify loop; executes tool calls; manages budgets; handles thread delegation; records execution steps; and resolves runtime paths for workspaces, sessions, runs, and skills.

This package is not tied to a specific model provider. As long as the caller provides a `StreamFn` and a tool list, the runtime can drive a complete task run.

## Architecture

`src/loop.ts` is the main loop. It is responsible for:

- Emitting session, chat, task, tool, verification, outcome, and error events.
- Routing each request as a direct answer, a normal task, or a thread.
- Running plan, execute, and verify for normal tasks, with retries controlled by `maxAttempts`.
- Creating child sessions for thread routes and using child Outcomes as verifiable task output.
- Tracking model-call and tool-call budgets.

Supporting modules:

- `src/runner.ts` provides `AgentRunner`, a thin wrapper around the main loop.
- `src/thread.ts` creates child sessions and recursively runs the runtime.
- `src/phases/*` stores phase definitions, routing scheduling, and verify phase helpers.
- `src/tools.ts` provides built-in `read`, `write`, `edit`, and `bash` tools.
- `src/dir.ts` resolves source/binary workspaces and safe in-workspace paths.
- `src/skills.ts` loads `SKILL.md` files.
- `src/turn-recorder.ts` records model prompts, structured output, and tool results as `ExecutionTurn` values.
- `src/types.ts` gathers runtime types, TypeBox schemas, and event definitions.

## Usage Flow

1. Prepare a session, model, `StreamFn`, and tool list.
2. Optionally provide `recordStep`, an event listener, tool approval hooks, and run budgets.
3. Call `AgentRunner.run` or `runAgentLoop`.
4. Use the returned Outcome to determine whether the task passed, and inspect events or execution steps to observe the run.

```ts
import { createSession } from "@rowan-agent/session";
import { AgentRunner, createCoreTools } from "@rowan-agent/runtime";

const session = createSession({
  systemPrompt: "You are Rowan.",
  input: "read README.md",
});

const runner = new AgentRunner();
const outcome = await runner.run({
  session,
  model: { provider: "openai-compatible", name: "gpt-4.1-mini" },
  stream,
  tools: createCoreTools({ root: process.cwd() }),
});
```
