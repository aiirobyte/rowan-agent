# Durable Multi-Agent Runtime Issue Slices

Status: Superseded by issue slices 0003

Source: [PRD-0001](../prd/0001-durable-agent-runtime.md)

Decision: [ADR-0001](../adr/0001-embedded-durable-agent-runtime.md)

These slices are ordered for test-driven implementation. Each slice must leave the public behavior it introduces passing before the next slice begins.

## Implementation direction

- `AgentRuntime` owns creation and reconstruction through `createAgent()` and `reconstructAgent(agentId, currentOptions)`.
- `Agent` is not directly constructible and exposes no independent execution path; `send()` is the only Agent Input entrypoint.
- `resumeAgent()` names only the preemptive Runtime Command that removes a pause.
- Store adapters expose semantic durable transitions. A terminal Run transition atomically updates its Outcome, triggering Message disposition, Lease, and Runtime Events.
- Scheduler decisions use durable Mailbox state, renew Leases, retry only explicit Infrastructure Failures, and dead-letter exhausted work atomically.
- Runtime Event delivery uses stable consumer identities and independent durable Checkpoints that advance after successful delivery.
- Tool Call capability, admission, execution, abort, and indeterminate classification stay behind the Runtime seam.

## Slice 1: Define the Runtime domain and Store contract

Introduce Agent ID, Agent Run, Runtime Message, Runtime Event, Tool Call, lifecycle states, and a `RuntimeStateStore` interface. Implement an in-memory adapter with transactional state-transition tests.

Acceptance:

- Agent, Message, Run, Event, and Tool Call records use opaque IDs and explicit lifecycle unions.
- Store operations express domain transitions rather than exposing raw collections.
- Enqueue, lease, suspend, complete, acknowledge, dead-letter, and indeterminate transitions reject invalid prior states.
- Tests use the Store interface and are reusable by later adapters.

## Slice 2: Add the SQLite Runtime Store

Implement the durable SQLite adapter and from-scratch schema with behavioral parity to the in-memory Store.

Acceptance:

- SQLite persists Agents, Messages, Runs, leases, Runtime Events, Runtime Event Consumer Checkpoints, and Tool Calls.
- Enqueuing work and creating its Run are atomic.
- Expired leases are recoverable after reopening the database.
- The shared Store contract suite passes against memory and SQLite.

Depends on: Slice 1.

## Slice 3: Add the process-wide Agent Runtime and private Agent Registry

Add explicit Runtime start/stop, Rowan-generated Agent IDs, private live bindings, and single-Runtime enforcement.

Acceptance:

- Starting a second Runtime in one process fails clearly.
- Creating or reconstructing an Agent binds it internally without a public bind API.
- Duplicate live binding for one Agent ID is rejected.
- Stopping and restarting leaves durable records recoverable.
- Tests isolate Runtime global state and cannot leak bindings across cases.

Depends on: Slices 1-2.

## Slice 4: Move Session hosting into Runtime-owned Agent lifecycle

Replace public direct construction with Runtime methods that own Session creation, reconstruction, and persistence callbacks.

Acceptance:

- `runtime.createAgent()` creates a new Session and Agent record.
- `runtime.reconstructAgent(agentId, currentOptions)` restores the same Agent ID and Session ID into a new in-memory object.
- Reconstruction uses current model, prompt, tools, skills, and phases supplied by the caller.
- Messages, model transcripts, outcomes, and execution state persist without an external host.
- Missing Agent records, missing Sessions, and duplicate bindings fail explicitly; Session ID cannot adopt or select an Agent identity.
- Public tests no longer need to assemble persistence callbacks around `new Agent()`.

Depends on: Slice 3.

## Slice 5: Add Mailboxes, `Agent.send()`, and `AgentRun`

Add fixed Agent Input messages, durable Run creation, non-blocking send, and the public AgentRun handle.

Acceptance:

- `send()` returns only after Message and Run persistence succeeds.
- `send()` does not wait for model or Tool execution.
- `AgentRun` exposes ID, status, `result()`, subscription, and precise abort.
- No public direct execution method exists beside `send()` and `AgentRun.result()`.
- Message redelivery cannot duplicate a completed Run.

Depends on: Slice 4.

## Slice 6: Implement Scheduler leases and Agent concurrency

Schedule persisted Mailbox work with single-Agent serialization, multi-Agent concurrency, capacity controls, leases, and infrastructure retry classification.

Acceptance:

- Two Agents may run concurrently under available capacity.
- One Agent never processes two Runs concurrently.
- Per-Agent Message order is preserved and busy Agents cannot starve all others.
- Lost or expired leases make retryable infrastructure work runnable again.
- Business and terminal Agent failures are not retried.
- Exhausted infrastructure retries fail the Run and dead-letter its Message.

Depends on: Slice 5.

## Slice 7: Suspend Runs and add preemptive Runtime Commands

Persist waiting-for-input suspension and implement pause, resume, and abort outside normal Mailbox order.

Acceptance:

- Input requests suspend the current Run and release its lease and capacity.
- The next `send()` resumes the same Run rather than creating another Run.
- Suspended Runs survive Store reopen and explicit Agent reconstruction with current Options.
- Abort terminates running or suspended work without becoming a Session message.
- Pause and resume produce durable Runtime Events.

Depends on: Slice 6.

## Slice 8: Recover durable work through explicit Agent reconstruction

Recover expired Leases during Runtime startup and periodic recovery, then resume durable work after the host explicitly reconstructs an Agent with current Options.

Acceptance:

- Runtime startup and periodic recovery return expired running work to a durable queued state without disturbing unexpired Leases or constructing Agent Bindings.
- `reconstructAgent(agentId, currentOptions)` restores the original Session and establishes the private Binding.
- Establishing an active Binding automatically schedules that Agent's queued Runs.
- A suspended Agent may remain unbound until the host reconstructs it before sending new input.
- Agent records persist identity and lifecycle state, but no executable Agent Options or definition version.

Depends on: Slices 3-7.

## Slice 9: Split durable Runtime Events from transient Stream Events

Add transactional Runtime Event/outbox delivery while preserving transient Agent streaming for live consumers.

Acceptance:

- Recovery-relevant transitions emit durable Runtime Events transactionally.
- Runtime Event Consumers resume from independent durable Checkpoints.
- Slow or unavailable consumers cannot block Runtime State transitions.
- Model deltas, message updates, and partial Tool output are not persisted.
- Stream Events cannot mutate Runtime State or make an Agent runnable.
- Existing live Agent subscription behavior remains available through the new lifecycle.
- The Extension EventBus remains transient and is not reused as the Runtime Event outbox.

Depends on: Slices 2-8.

## Slice 10: Centralize Tool execution in Tool Runtime

Route all Tool Calls through one Runtime-controlled executor with capability checks, narrowing policy, limits, abort, and durable call state.

Acceptance:

- Only Tools assembled from the current Agent Context and code-defined Extensions may execute.
- Runtime policy may remove but never add Tool Capability.
- Global and per-Tool concurrency limits apply across Agents.
- Abort propagates to active Tool adapters.
- Definite Tool failures are terminal results, not infrastructure retries.
- Interrupted uncertain side effects become indeterminate and cannot be blindly retried.

Depends on: Slices 2, 6-7.

## Slice 11: Migrate Rowan CLI and remove the legacy lifecycle

Move Rowan CLI and examples to explicit Runtime startup, `runtime.createAgent()` / `runtime.reconstructAgent(agentId, currentOptions)`, `send()`, and AgentRun. Remove public direct construction, static lifecycle factories, ambient Runtime access, and duplicate execution paths.

Acceptance:

- Rowan CLI starts and stops one configured Runtime.
- New and reconstructed CLI Agents use the public Runtime-owned lifecycle and are addressed by Agent ID.
- Examples cover non-blocking send, waiting on AgentRun, and suspended input.
- Public exports and README describe only the new lifecycle.
- Tests prove no external Session host is required.
- Release notes identify the breaking API and downstream migration requirements.

Depends on: Slices 4-10.

## Verification Order

For each slice:

1. Add a failing test at the public seam introduced by the slice.
2. Implement the smallest behavior that makes it pass.
3. Run the focused package test file.
4. Run `bun test packages/agent`.
5. Run `bun run build` before marking the slice complete.
