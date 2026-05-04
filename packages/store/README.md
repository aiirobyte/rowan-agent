# @rowan-agent/store

## Main Features

`@rowan-agent/store` provides Rowan `AgentStore` implementations. Compared with `SessionStore`, an `AgentStore` saves the session itself plus each phase's `ExecutionTurn`, which makes it possible to replay model prompts, structured output, tool calls, and tool results.

The package currently includes in-memory storage and local JSON file storage. They are intended for tests/temporary runs and CLI/local persistence respectively.

## Architecture

`src/types.ts` defines the `AgentStore` interface, the TypeBox schema for `ExecutionTurn`, runtime validators, deep cloning, and step filtering.

`src/memory.ts` implements `InMemoryAgentStore`, keeping sessions and steps in a Map for single-process tests.

`src/json.ts` implements `LocalJsonAgentStore`, writing each session to one `<session-id>.json` file. Writes go through a temporary file and rename to reduce partial-write risk; reads validate the session id and schema version.

## Usage Flow

1. Use `InMemoryAgentStore` for tests or short-lived runs.
2. Use `LocalJsonAgentStore(sessionsDir)` for CLI or local persistence.
3. At the composition root, save `Agent.run()` results and use `recordStep` to collect execution steps.
4. For debugging, call `loadSteps(sessionId, filter)` to filter execution records by phase, scope, or time.

```ts
import { LocalJsonAgentStore } from "@rowan-agent/store";

const store = new LocalJsonAgentStore("sessions");

const agent = new Agent({
  context: {
    systemPrompt: "You are Rowan.",
    messages: [],
    tools,
  },
  model,
  stream,
});

const steps = [];
const result = await agent.run({
  recordStep: async (step) => {
    steps.push(step);
  },
});
await store.save(result.session);
for (const step of steps) {
  await store.appendStep(step.sessionId, step);
}
```
