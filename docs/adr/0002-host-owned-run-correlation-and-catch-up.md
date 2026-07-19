---
status: accepted
---

# Persist opaque Run metadata and expose a durable consumer catch-up barrier

Rowan persists optional opaque `AgentRunMetadata` from Agent Input on the Agent Run. The metadata is echoed on `run_enqueued`, suspension, completion, and abort Runtime Events. Rowan does not validate or interpret the metadata; the host owns its schema and business meaning.

The Runtime exposes `listActiveRuns()` for queued, running, and suspended Runs and `consumeEventsAndCatchUp(consumerId, listener)`, which installs a durable Event Consumer and resolves only after all Events through the current checkpoint have been delivered and acknowledged. A listener disposition that enqueues Agent Input is acknowledged atomically with that input and its Run.

## Consequences

- Hosts can recover active Agents with current `AgentOptions` while retaining durable Agent, Session, Run, and Mailbox identities.
- Host correlation data survives process loss without becoming a Rowan business model.
- Terminal event consumers can deliver outcomes without an in-memory queue or a separate acknowledgement table.
- A failed listener leaves its durable checkpoint unchanged and the Event replayable.
- Runtime SQLite initialization adds the metadata column for older local stores; missing metadata remains `undefined`.
