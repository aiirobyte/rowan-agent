---
status: accepted
---

# Use an embedded durable runtime behind Agent

Rowan will replace public direct `Agent` construction with `Agent.create()` and `Agent.resume()` backed by one explicitly started, process-wide Runtime. The Runtime owns generated Agent identities, durable mailboxes, per-Agent serial scheduling, recovery state, and Tool Call control; hosts register opaque Agent Factories and keep business-object associations outside Rowan.

Sessions remain conversation records, while mutable runtime control state lives in a separate embedded store. Workflow and Memory remain host-owned concepts, and the first runtime executes only while its host process is alive rather than introducing a daemon.

## Consequences

- This is a breaking SDK change: `new Agent()` is no longer the public lifecycle entrypoint.
- One Agent owns one Session, but Agent ID and Session ID remain distinct.
- Runtime Messages are limited to Agent Input rather than becoming a general Agent communication protocol.
- The durable Runtime uses SQLite while existing Session transcripts remain JSONL.
