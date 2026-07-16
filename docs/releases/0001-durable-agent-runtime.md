# Durable Agent Runtime migration

The durable runtime introduces a breaking lifecycle boundary.

## Required changes

- Start one `AgentRuntime` per process with a `RuntimeStateStore` and Session provider.
- Replace host-owned `new Agent(...)` plus `agent.run(...)` with `Agent.create(...)` or explicit `Agent.resume(...)`.
- Submit user input with `agent.send(...)` and await `AgentRun.result()` when a terminal outcome is needed.
- Register opaque recovery Factories when a host expects unfinished Agents to be reconstructed after Runtime restart.
- Treat Runtime Events as durable recovery signals; keep live model and partial output on transient Agent subscriptions.

The CLI now owns this lifecycle and stores Runtime state beside workspace Sessions.
