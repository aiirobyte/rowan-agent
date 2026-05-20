# @rowan-agent/store

## Main Features

`@rowan-agent/store` provides local filesystem persistence for the Rowan `SessionManager` interface. The current implementation stores sessions as append-only JSONL files so conversation messages, outcomes, and branch metadata are durable as they happen.

## Architecture

`src/jsonl.ts` implements `LocalJsonlSessionManager`. Each session lives in `<workspace>/sessions/<session-id>.jsonl`. The first line is a `header` record; later lines are append-only `SessionEntry` records.

The old whole-state JSON `AgentStore` path is not retained in v0.4.4.

## Usage Flow

1. Use `LocalJsonlSessionManager.create(sessionsDir, input)` to start a new durable session.
2. Use `LocalJsonlSessionManager.open(sessionsDir, id)` to resume a session.
3. Append the user message before `Agent.run()`.
4. Pass `sessionId` and `buildAgentContext()` output into the Agent.
5. Append assistant conversation messages and the final `Outcome` after the run returns.

```ts
import { LocalJsonlSessionManager } from "@rowan-agent/store";
import { createMessage } from "@rowan-agent/session";

const manager = await LocalJsonlSessionManager.create("sessions", {
  systemPrompt: "You are Rowan.",
  input: "inspect the workspace",
});
await manager.appendMessage(createMessage("user", "inspect the workspace", { scope: "conversation" }));

const agent = new Agent({
  context: await manager.buildAgentContext({ tools }),
  sessionId: manager.getSessionId(),
  model,
  stream,
});

const result = await agent.run({
  context: await manager.buildAgentContext({ tools }),
  sessionId: manager.getSessionId(),
});
await manager.appendOutcome(result.outcome);
```
