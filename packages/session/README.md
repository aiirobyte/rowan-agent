# @rowan-agent/session

## Main Features

`@rowan-agent/session` defines Rowan sessions, messages, skills, and the session storage interface. It creates new sessions, appends user input, separates conversation/execution/diagnostic message scopes, and converts live sessions into persistable structures.

It also provides `InMemorySessionStore` for tests or lightweight scenarios that do not need execution-step storage.

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

## Usage Flow

1. Call `createSession` to create a session.
2. Call `appendUserTurn` whenever the user continues the conversation.
3. During execution, write events to `session.log` and user-facing messages to `session.messages`.
4. Before saving, call `toPersistedSession`, or use a storage class that implements `SessionStore`.

```ts
import { appendUserTurn, createSession } from "@rowan-agent/session";

const session = createSession({
  systemPrompt: "You are Rowan.",
  input: "hello",
});

appendUserTurn(session, "continue");
```
