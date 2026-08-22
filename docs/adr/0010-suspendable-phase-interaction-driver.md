---
status: accepted
---

# Add a generic suspendable Phase Interaction Driver

Rowan adds an execution-scoped, protocol-neutral `PhaseInteractionDriver`. The
v0.9.7 local implementation lets a Phase create typed Interactions, read
answers, suspend with JSON-safe continuation state, and observe cancellation.
Rowan persists the generic Interaction collection and Run boundary while
leaving activity streams, Session or Channel grouping, payload meaning,
transport, Provider, and external process ownership to the host.

## Context

The current Rowan baseline is `v0.9.7`. A direct `Phase.run` receives a
`PhaseExecution` with snapshot, restore, model, and Tool methods. The Runtime
can commit one `InputRequest` and one `ExecutionCheckpoint`, and an
`AgentRun.respond()` call continues that boundary.

That model does not cover a host integration that needs several pending
requests, streamed activity, independent external channels, user answers that
arrive out of order, cancellation propagation, and restart-safe continuation.
Keeping those behaviors in each host would duplicate durable state and weaken
Rowan's Run authority.

Teaching Rowan about ACP or another host protocol would create the opposite
problem: a reusable Runtime would become coupled to Provider and transport
concepts it does not own.

## Decision

### Put the capability on `PhaseExecution`

`PhaseExecution` gains the generic interaction capability. `PhaseContext`
remains a data snapshot. A Phase can request typed Interactions, checkpoint
JSON-safe continuation state, suspend, and observe cancellation through the
execution-scoped driver.

The public method names are finalized by the implementation slices, but the
semantic interface is documented in
[`packages/agent/docs/phase-interactions.md`](../../packages/agent/docs/phase-interactions.md).

### Replace the singular internal request with an additive collection

Rowan persists a collection of pending Phase Interactions for the Run boundary.
Each Interaction has a stable ID, generic kind, opaque JSON-safe payload, Phase
identity, and lifecycle state. A resolved Interaction is answered once by ID;
repeated answers are idempotent and late answers are rejected.

The existing `input_required` Run state remains the compatibility boundary.
Existing one-shot `user_input` callers continue through a legacy projection and
the existing `requestId` response shape while new callers use typed Interaction
IDs.

### Make suspension a data boundary

A Phase that cannot continue returns a generic suspension boundary containing a
JSON-safe checkpoint and unresolved Interaction IDs. Rowan persists that
boundary and later starts a new Execution Attempt with the same immutable
Configuration Snapshot and resolved answers.

Rowan never serializes a JavaScript closure, keeps an application Promise alive
across restart, or automatically replays an external side effect after
ambiguous recovery.

### Keep host grouping outside Rowan

Rowan exposes no Session or Channel primitive. A host may map Interaction IDs to
multiple processes, Sessions, streams, or external tasks and may run them
concurrently. The host owns their identity, ordering, cancellation, and
explicit close/join policy. Existing route-based parallel Phase execution
remains a separate feature for Phase-level fan-out.

### Keep ownership split at the Runtime boundary

Rowan owns:

- Agent and Run lifecycle;
- Phase execution and immutable Configuration Snapshot;
- Interaction identity, state, and answer idempotency;
- checkpoint and resume boundary;
- event ordering, observation, and cancellation.

The host owns:

- the meaning of opaque payloads and metadata;
- transport and external process behavior;
- Provider selection and capability policy;
- raw protocol trace and external identifiers;
- host-specific Session or Channel join and result projection.

## Consequences

- External interactive runtimes can reuse Rowan's durable Run and Phase
  lifecycle without creating a parallel host-owned input engine.
- Rowan's public Phase API gains a reusable suspension seam while remaining
  independent of ACP and other protocols.
- The Durable Store, snapshots, Run events, recovery, public interfaces, and
  test fixtures must evolve from one open input request to a collection.
- Phase authors must make suspended work reconstructable from JSON-safe state;
  live closures are not a supported continuation mechanism.
- Hosts must translate protocol-specific activity and requests into generic
  Interactions and keep their protocol trace outside Rowan.
- The current `v0.9.7` API is the stable additive implementation boundary;
  broader host activity and Session/Channel semantics remain outside Rowan.

## Rejected options

- **Put ACP or Provider types in Rowan**: rejected because protocol and
  executable ownership belongs to the embedding host.
- **Keep one `openInputRequest`**: rejected because concurrent host work needs
  multiple independently answerable requests.
- **Hold the Phase Promise open**: rejected because a live Promise cannot be
  recovered after process loss and prevents durable scheduling.
- **Serialize JavaScript closures**: rejected because closures are not a
  stable, portable, or safe durable representation.
- **Model host Sessions as Tool Calls**: rejected because Sessions have
  independent interaction and cancellation lifecycles.
- **Put host Session grouping in Rowan**: rejected because external process and
  provider lifecycle belongs to the embedding host.
- **Break the existing input API**: rejected because existing Phase authors and
  hosts need an additive migration path.
