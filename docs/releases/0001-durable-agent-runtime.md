# Durable Agent Runtime migration

The durable runtime introduces a breaking lifecycle boundary.

There is no compatibility migration. Remove an existing `.rowan/runtime.sqlite`
before adopting this schema; Sessions remain separate JSONL records.

## Required changes

- Start one `AgentRuntime` per process with a `RuntimeStateStore` and Session provider.
- Replace host-owned `new Agent(...)` and `agent.run(...)` with `runtime.createAgent(...)` or `runtime.reconstructAgent(agentId, currentOptions)`.
- Submit user input with `agent.send(...)` and await `AgentRun.result()` when a terminal outcome is needed.
- Register opaque recovery Factories when a host expects unfinished Agents to be reconstructed after Runtime restart.
- Give every Runtime Event Consumer a stable ID; its durable Checkpoint advances only after successful delivery.
- Treat live model and partial Tool output as transient Agent Events, not Runtime Events.

The CLI now owns this lifecycle and stores Runtime state beside workspace Sessions.
