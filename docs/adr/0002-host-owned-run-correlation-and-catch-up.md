---
status: superseded by ADR-0004
---

# Persist opaque Run metadata and expose durable Run listing and consumer handles

Rowan persists optional opaque `AgentRunMetadata` from Agent Input on the Agent Run. The metadata is echoed on `run_enqueued`, suspension, completion, and abort Runtime Events. Rowan does not validate or interpret the metadata; the host owns its schema and business meaning.

The Runtime exposes `listRuns({ agentId?, states? })` for stable historical and lifecycle Run views. It also exposes one `consumeEvents(consumerId, listener)` method returning a `RuntimeEventConsumer` handle:

```ts
type RuntimeEventConsumer = {
  caughtUp: Promise<void>;
  stop(): void;
};
```

Registration installs a durable Event Consumer immediately. `caughtUp` resolves after all Events through the registration waterline have been delivered and acknowledged. Stopping before that barrier rejects `caughtUp` with `AbortError`. A listener disposition that enqueues Agent Input is acknowledged atomically with that input and its Run. The former `consumeEventsAndCatchUp()` method is removed so Runtime and AgentRun consumers share one lifecycle shape.

## Consequences

- Hosts can recover active Agents with current `AgentOptions` while retaining durable Agent, Session, Run, and Mailbox identities.
- Hosts can inspect historical Runs without creating a business-owned Run index.
- Host correlation data survives process loss without becoming a Rowan business model.
- Terminal event consumers can deliver outcomes without an in-memory queue or a separate acknowledgement table.
- A failed listener leaves its durable checkpoint unchanged and the Event replayable.
- Runtime SQLite initialization adds the metadata column for older local stores; missing metadata remains `undefined`.
