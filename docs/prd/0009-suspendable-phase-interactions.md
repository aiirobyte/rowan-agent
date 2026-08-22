# PRD: Suspendable Phase Interactions

## Status

Accepted local implementation plan for
[ADR-0010](../adr/0010-suspendable-phase-interaction-driver.md). The current
Rowan release baseline is `v0.9.7`. The local implementation ships the typed
Interaction request/answer, durable suspension, checkpoint recovery, and
cancellation subset. External activity streams, Session or Channel grouping,
and deadline policy remain host-owned extensions rather than Rowan APIs.

## Problem

Rowan's direct `Phase.run` callback currently receives execution utilities and
returns a `PhaseOutput`. The durable Runtime boundary is built around one
`InputRequest`, one checkpoint, and one `respond()` identity. That is enough for
a single user-input pause, but not for a Phase that coordinates an interactive
host runtime.

An interactive Phase needs to publish durable activity, hold multiple pending
requests, open independent host-defined channels, accept out-of-order answers,
cancel external work, and resume after a process restart. These behaviors must
remain part of Rowan's durable execution contract without teaching Rowan about
ACP, Providers, processes, or host business domains.

## Outcome

Rowan provides an execution-scoped `PhaseInteractionDriver`. A Phase can use it
to publish activity, create typed Interactions, open opaque channels, checkpoint
JSON-safe continuation state, suspend, and observe cancellation. The Runtime
persists the Interaction collection with the Run boundary and resumes from a
new Execution Attempt after answers arrive.

Existing Phase callbacks, route-based parallel Phases, the `input_required`
Run state, and `AgentRun.respond({ requestId, input })` remain compatible. The
new typed contract is additive and protocol-neutral.

## Requirements

### R1: Execution-scoped driver

- Add a generic `PhaseInteractionDriver` to `PhaseExecution`.
- Keep `PhaseContext` data-only; do not place lifecycle methods on it.
- Expose publish, request, channel, suspension, and cancellation semantics
  without ACP or Provider terminology.
- Provide an `AbortSignal` or equivalent cancellation observation on the
  execution-scoped driver.

### R2: Typed Interaction collection

- Define generic kinds including `user_input`, `permission`, `elicitation`,
  and `confirmation`.
- Persist multiple pending Interactions for one Run and Phase Execution.
- Use a stable Interaction ID as the answer idempotency identity.
- Support `pending`, `answered`, `denied`, `cancelled`, and `expired` states.
- Keep request payload and host metadata JSON-safe and opaque to Rowan.

### R3: Durable suspension

- Let a direct Phase produce a generic suspension boundary containing a
  JSON-safe checkpoint and unresolved Interaction IDs.
- Resume through a new Execution Attempt using the same immutable Configuration
  Snapshot.
- Do not serialize JavaScript closures or retain a live Promise across a
  durable boundary.
- Do not automatically replay an external side effect after restart.

### R4: Host-defined channels

- Allow a Phase to open more than one opaque Interaction Channel.
- Give each Channel a stable identity scoped to the owning Run and Phase.
- Preserve Channel lifecycle and events without interpreting host semantics.
- Keep channel concurrency distinct from Rowan's existing route-based parallel
  Phase execution.
- Require an explicit host close/join operation before a related channel group
  is considered complete; do not create implicit detached work.

### R5: Public Run and Store contracts

- Extend the durable Run aggregate from singular `openInputRequest` to a
  collection while retaining a compatibility projection for `user_input`.
- Add typed answer-by-Interaction-ID semantics to `AgentRun` and Store seams.
- Keep the public `input_required` state as the compatibility boundary unless a
  later design proves a new generic state is necessary.
- Include checkpoint, Interaction collection, event cursor, and cancellation
  data in recovery and snapshot validation.

### R6: Events and observation

- Publish normalized Phase Interaction activity through the existing Run event
  and observation model.
- Give Interaction and Channel events deterministic identity and ordering.
- Keep durable events authoritative for recovery; live-only activity may remain
  best-effort where the host does not request durability.
- Do not expose raw host protocol messages as Rowan events.

### R7: Cancellation and deadlines

- Propagate Run and Execution Attempt cancellation through the driver signal.
- Stop new Interaction or Channel work after cancellation.
- Resolve pending Interactions as cancelled where Rowan owns their state.
- Represent deadline expiration explicitly and avoid indefinite waits.
- Preserve Rowan's indeterminate/no-automatic-retry rule for uncertain external
  effects.

### R8: Compatibility and delivery

- Existing local `Phase.run` implementations compile and behave unchanged when
  they do not use the new driver.
- Existing `respond({ requestId, input })` remains valid for one-shot
  `user_input` callers.
- Existing route-based serial and parallel Phase behavior remains unchanged.
- Public interfaces, InMemory Store, SQLite Store, Runtime recovery, and docs
  are updated together.
- Release the completed API as a version after focused tests, typecheck, public
  interface checks, and the full package suite pass.

## State model

| Object | State or boundary |
| --- | --- |
| Interaction | `pending` → `answered`, `denied`, `cancelled`, or `expired` |
| Channel | host-defined open/active/closed/cancelled lifecycle, identified by opaque ID |
| Phase | returns `PhaseOutput` or produces a durable `PhaseSuspension` |
| Run | existing `queued`, `running`, `input_required`, and terminal states remain authoritative |
| Checkpoint | JSON-safe continuation data tied to the immutable Configuration Snapshot |

## Non-goals

- ACP, Codex, Claude, MCP, or any Provider protocol;
- local or remote process management;
- Provider authentication, permissions policy, or filesystem policy;
- raw external trace storage;
- arbitrary host command execution;
- replacing Rowan Agent/Run identity with channels;
- automatic retry or prompt replay;
- changing route-based Phase parallelism.

## Acceptance

- A public Phase test creates two pending Interactions, answers them out of
  order, and resumes from one durable checkpoint.
- Duplicate answers are idempotent and late answers are rejected without a
  second side effect.
- A Phase can publish durable activity before suspending and replay it through a
  Run observation cursor after restart.
- A Phase can open and close multiple opaque Channels without Rowan knowing
  their host protocol.
- Cancellation aborts the driver, cancels pending Interactions, and prevents
  new Channel work.
- Existing single-input, route, serial, parallel, Tool, and recovery tests
  remain green.
- InMemory and SQLite Store behavior matches for Interaction collections,
  checkpoints, snapshots, events, and idempotency.
- Public interface checks and package typecheck cover the new exported types.
