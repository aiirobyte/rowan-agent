# @rowan-agent/session

## Main Features

`@rowan-agent/session` defines Rowan sessions, messages, skills, scoped message rules, and append-only SessionManager contracts. It creates live Session values for the Agent loop, separates conversation/execution/diagnostic message scopes, and reconstructs model-visible context from durable Session entries.

It also provides `InMemorySessionManager` for tests or lightweight scenarios that do not need filesystem persistence.

## Architecture

`src/session.ts` contains the in-memory session model:

- `Session` stores the system prompt, initial input, messages, runtime log, skills, timestamps, and optional parent session.
- `createSession` creates a session with the first user message.
- `appendUserTurn` appends multi-turn user input.
- `createMessage` infers message scope from role and metadata.
- `latestUserInput` returns the latest user message in conversation scope.

`src/session-store.ts` contains the persistence model:

- `PersistedSessionSchema` defines the on-disk shape.
- `toPersistedSession` keeps only conversation messages so execution noise does not pollute normal conversation history.
- `sessionFromPersisted` restores a runtime session from persisted data.
- `SessionStore` defines the create/load/save/list/delete interface.

`src/session-manager.ts` contains the current v0.4.4 persistence contract:

- `SessionHeader` is the first JSONL record for a durable session.
- `SessionEntry` stores append-only message, outcome, compaction, branch summary, session info, custom records, and optional derived execution-turn records.
- `SessionManager` appends entries, branches by active leaf, lists entries, and rebuilds an Agent context from the selected leaf.
- `InMemorySessionManager` implements the same interface without filesystem IO.

## Usage Flow

1. Use `InMemorySessionManager.create()` in tests, or `LocalJsonlSessionManager.create/open()` from `@rowan-agent/store` in local runtime code.
2. Append the current user message before calling `Agent.run()`.
3. Call `buildAgentContext()` and pass the result plus `sessionId` into `Agent.run()`.
4. Append assistant conversation messages and `Outcome` entries after the run returns.

```ts
import { InMemorySessionManager, createMessage } from "@rowan-agent/session";

const manager = InMemorySessionManager.create({
  systemPrompt: "You are Rowan.",
  input: "hello",
});

await manager.appendMessage(createMessage("user", "hello", { scope: "conversation" }));
const context = await manager.buildAgentContext();
```
