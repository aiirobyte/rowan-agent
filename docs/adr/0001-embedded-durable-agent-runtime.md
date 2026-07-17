---
status: accepted
---

# Use an embedded durable Runtime as the sole Agent lifecycle owner

Rowan uses one explicitly started, process-wide Runtime as the only owner of Agent creation, reconstruction, input acceptance, scheduling, recovery, Runtime Event delivery, and Tool Call control. Hosts create Agents through `runtime.createAgent()`, reconstruct an existing Agent Binding through `runtime.reconstructAgent(agentId, currentOptions)`, submit input through `Agent.send()`, and observe terminal work through `AgentRun`; direct construction and an independent `run()` path do not exist.

Sessions remain conversation records, while mutable runtime control state lives in a separate embedded store. Workflow and Memory remain host-owned concepts, and the first runtime executes only while its host process is alive rather than introducing a daemon.

## Consequences

- This is a breaking SDK change with no compatibility lifecycle: `new Agent()`, `Agent.create()`, `Agent.resume()`, and direct `run()` are not public entrypoints.
- The Runtime SQLite schema is from-scratch; existing Runtime databases are replaced rather than migrated.
- One Agent owns one Session, but Agent ID and Session ID remain distinct.
- Agent reconstruction is addressed only by Agent ID; `resume` is reserved for the Runtime Command that removes an Agent pause.
- Each durable state transition owns all related Run, Message, Lease, Outcome, and Runtime Event changes atomically behind the Runtime Store seam.
- Runtime Event acknowledgement belongs to a stable Runtime Event Consumer Checkpoint rather than to an Event globally.
- Scheduler policy and Tool Call execution remain Runtime implementation details; Store, Session, Model, and Tool implementations sit behind explicit adapter seams.
- Runtime Messages are limited to Agent Input rather than becoming a general Agent communication protocol.
- The durable Runtime uses SQLite while existing Session transcripts remain JSONL.
