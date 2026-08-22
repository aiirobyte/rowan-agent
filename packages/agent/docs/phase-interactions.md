# Phase Interactions

## Status

Shipped additive Rowan Runtime API. See
[ADR-0010](../../../docs/adr/0010-suspendable-phase-interaction-driver.md),
[PRD-0009](../../../docs/prd/0009-suspendable-phase-interactions.md), and the
[implementation slices](../../../docs/issues/0009-suspendable-phase-interaction-slices.md).

The current Rowan baseline is `v0.9.7`. The contract is generic and does not
define ACP or any other host protocol.

## Purpose

The current direct `Phase.run` callback can execute code and return a
`PhaseOutput`, while Rowan's durable input boundary stores one `InputRequest`.
Interactive host integrations need a richer boundary:

- more than one pending request;
- typed requests and answers;
- JSON-safe continuation state;
- cancellation and deadlines;
- JSON-safe suspension and restart recovery.

Rowan supplies the lifecycle and persistence seam. The host supplies the
meaning of the payload, activity projection, external transport, Session
grouping, and any Provider-specific policy.

## Vocabulary

- **Phase Interaction**: one durable typed request emitted by the current Phase.
- **Phase Interaction Driver**: the execution-scoped capability used by a Phase
  to request, answer, checkpoint, suspend, and observe cancellation.
- **Phase Suspension**: a durable boundary containing JSON-safe continuation
  data and the unresolved Interaction set.

## Lifecycle

```text
Phase.run
   │
   ├─ create one or more typed Interactions
   │
   ├─ complete ───────────────────────────────► PhaseOutput
   │
   └─ suspend({ checkpoint, pendingInteractions })
          │
          ├─ persist Run boundary, checkpoint, and Interaction collection
          ├─ host observes and answers one or more Interactions
          └─ Rowan starts a new Execution Attempt with answers available
```

The suspension boundary is a data boundary, not a suspended JavaScript
Promise. A Phase must be able to reconstruct its next decision from its
checkpoint and the resolved Interaction values. Rowan never serializes a
closure and never replays a side effect merely because the host process
restarted.

## Public contract

```typescript
type PhaseInteractionKind =
  | "user_input"
  | "permission"
  | "elicitation"
  | "confirmation";

type PhaseInteractionStatus =
  | "pending"
  | "answered"
  | "denied"
  | "cancelled"
  | "expired";

type PhaseInteraction = {
  id: string;
  phase: string;
  kind: PhaseInteractionKind;
  prompt: string;
  payload?: JsonValue;
  status: PhaseInteractionStatus;
  createdAt: string;
};

type PhaseInteractionDriver = {
  signal: AbortSignal;
  request(input: {
    id?: string;
    kind: PhaseInteractionKind;
    prompt: string;
    payload?: JsonValue;
  }): PhaseInteraction;
  pending(): readonly PhaseInteraction[];
  answers(): ReadonlyMap<string, JsonValue>;
  suspend(input?: { checkpoint?: JsonValue }): never;
};
```

`PhaseExecution.interaction` exposes this driver. The following rules are
implemented:

- `PhaseExecution` exposes the driver; `PhaseContext` remains data and does
  not gain host lifecycle methods.
- `payload` and host metadata are JSON-safe but opaque to Rowan.
- Rowan stores a collection of pending Interactions, not one global request.
- Each Interaction is answered by ID, with one-shot idempotency. An omitted ID
  is matched across resume by kind, prompt, and payload; dynamic requests
  should supply an explicit ID.
- Answers may arrive out of order across pending Interactions.
- A completed, denied, cancelled, or expired Interaction cannot be answered
  again with a new side effect.
- Hosts may map interaction IDs to processes, Sessions, streams, or external
  tasks without adding those concepts to Rowan.
- Existing `AgentRun.respond({ requestId, input })` remains a compatibility
  projection for `user_input`. The typed API uses an Interaction ID.

## Run boundary and persistence

The existing `input_required` Run state remains the public compatibility
state. Its durable request representation evolves from a singular
`openInputRequest` to an Interaction collection while retaining a legacy
single-input projection.

The durable boundary must contain:

- the Run and Phase identity;
- the immutable Configuration Snapshot reference;
- the JSON-safe Phase checkpoint;
- all pending Interaction IDs and their typed state;
- the event cursor needed for observation and recovery;
- cancellation and deadline state when applicable.

Rowan owns these generic fields. A host may persist a separate projection for
its external channel, Provider, process, or trace, but Rowan never interprets
that projection.

## Host grouping and concurrency

Rowan v0.9.7 does not expose a Channel or Session primitive. A host may map
Interaction IDs to concurrent processes, Sessions, streams, or external tasks,
but it owns their lifecycle and concurrency policy. Existing route-based
parallel Phases remain unchanged and continue to represent Phase-level fan-out.

When a host creates a related group of external operations, the host must
provide the explicit close/join operation and persist its own group state. No
external operation should remain implicitly detached after the parent Run
reaches a terminal state.

## Cancellation and deadlines

`PhaseInteractionDriver.signal` is aborted when the owning Execution Attempt or
Run is cancelled. The driver rejects new requests with
`PhaseInteractionCancelledError` after cancellation and must stop creating new work,
resolve pending Interactions as cancelled where the host can do so, and return
control to Rowan without waiting indefinitely for an external operation.

Deadlines are observable through the driver or execution context and are
represented as typed terminal or expired states. Rowan does not retry a Phase
automatically after an ambiguous external side effect.

## Host integration boundary

Hosts implement the protocol-specific side of the driver. A host may map
channels to local processes, remote streams, UI conversations, or another
runtime. That mapping is outside Rowan's domain contract.

The host is responsible for:

- validating opaque payloads;
- selecting and authorizing capabilities;
- translating protocol messages into normalized activity;
- storing protocol-specific trace and external identifiers;
- deciding how a channel joins or reports external failure.

Rowan is responsible for:

- durable Run and Phase lifecycle;
- Interaction identity, state, and idempotent answers;
- checkpoint and resume boundaries;
- event ordering and observation;
- cancellation propagation and Run terminal state.

## Non-goals

- ACP, Codex, Claude, MCP, or any other protocol dependency;
- Provider registries or executable process management;
- arbitrary shell or filesystem policy;
- raw protocol trace persistence;
- automatic replay of prompts or external side effects;
- replacing existing route-based Phase parallelism;
- treating a host channel as a Rowan Agent or Agent Run.
