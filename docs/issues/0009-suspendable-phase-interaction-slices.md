# Issue drafts: Suspendable Phase Interactions

Status: Implemented locally for the interaction boundary; the Channel and
deadline slices belong to the host by design. Do not publish to GitHub without a
separate request.

Source: [PRD-0009](../prd/0009-suspendable-phase-interactions.md)

Decision: [ADR-0010](../adr/0010-suspendable-phase-interaction-driver.md)

The current Rowan baseline is `v0.10.1`. Each slice is one red → green cycle
through a public Runtime seam. Host-specific ACP or Provider work is outside
these Rowan slices.

The shipped local boundary is typed Interaction request/answer, durable
suspension and checkpoint recovery, and cancellation. Activity streams,
Session/Channel grouping, and deadline policy remain host-owned; Mori
implements those concerns for ACP Session Groups.

## Progress: Slice 7 verified at v0.10.1 (recorded after the fact, 2026-09-25)

Slice 7 is the verification and delivery slice, and it holds at `v0.10.1`:

- `test/runtime/phase-interactions.test.ts`,
  `test/runtime/durable-store.test.ts`,
  `test/runtime/sqlite-durable-store.test.ts` and
  `test/public-exports.test.ts` pass (26 tests), together with the complete
  package suite, `tsc`, `bun run build:packages` and `git diff --check`.
- The public package exports the generic API only:
  `PhaseInteractionBoundary`, `PhaseInteractionCancelledError`, and the
  `PhaseInteraction*` types; no Channel, Session, or deadline primitive exists in
  `packages/*/src`.
- `packages/agent/docs/phase-interactions.md` matches the shipped contract, and
  its baseline now names this release.
- The host consumes the seam without Rowan-specific protocol dependencies: Mori
  answers Interactions through the generic `PhaseInteractionDriver` and keeps
  ACP Session grouping on its own side.

## Progress (recorded after the fact, 2026-09-24)

Seam-level audit: the interaction boundary landed — `harness/phases/interactions.ts`
(the driver, boundary, cancellation), the durable store's open/answer interaction
records, and `AgentRun.respondInteraction` with the run-state change carrying
interactions and answers; documented in `docs/phase-interactions.md` and pinned by
`test/runtime/phase-interactions.test.ts`.
Slices 4 (Opaque Channel lifecycle) and 6 (deadlines) have no seam here by
design: ADR-0010 scopes Channel grouping and deadline policy to the host, and no
Channel or deadline primitive exists in `packages/*/src`.

## Dependency map

| Slice | Depends on |
| --- | --- |
| 1. Public Interaction types and Phase driver | - |
| 2. Durable Interaction collection | 1 |
| 3. Suspension and checkpoint resume | 1-2 |
| 4. Opaque Channel lifecycle | 1-3 |
| 5. Events, observation, and answer API | 1-4 |
| 6. Cancellation and deadlines | 1-5 |
| 7. Compatibility and delivery verification | 1-6 |

## Slice 1: Public Interaction types and Phase driver

Add failing public-interface tests for generic Interaction kinds, lifecycle
states, opaque JSON-safe payloads, an execution-scoped driver, and an
AbortSignal. Expose the smallest `PhaseInteractionDriver` contract on
`PhaseExecution` without changing existing Phase callback behavior.

Acceptance:

- Existing Phase code compiles without using the driver.
- The driver is available only to the current Phase Execution.
- Rowan exports the generic types without ACP, Provider, process, or transport
  names.
- Payload and metadata validation is limited to Rowan's JSON-safe boundary.

## Slice 2: Durable Interaction collection

Add failing InMemory and SQLite Store examples for more than one pending
Interaction in one Run, stable IDs, out-of-order answers, idempotent duplicate
answers, denied/cancelled/expired states, and compatibility with the singular
`user_input` projection.

Acceptance:

- A Run can persist multiple pending Interactions atomically with its revision.
- Each Interaction answer is keyed by its own ID and cannot create a second
  side effect.
- Snapshot validation and Store operations agree for InMemory and SQLite.
- Existing `input_required` snapshots and `requestId` callers remain valid.

## Slice 3: Suspension and checkpoint resume

Add a failing direct `Phase.run` example that publishes an Interaction,
suspends with JSON-safe continuation data, answers the request, and resumes in a
new Execution Attempt. Add incompatible-checkpoint and process-restart cases.

Acceptance:

- Suspension persists the checkpoint and unresolved Interaction IDs.
- Resume uses the same immutable Configuration Snapshot.
- No JavaScript closure or live Promise is required across the boundary.
- Invalid or incompatible checkpoints fail deterministically.
- External side effects are not automatically replayed after ambiguity.

## Slice 4: Opaque Channel lifecycle

Add failing examples for opening multiple host-defined Channels, publishing
Channel activity, attaching Interactions to a Channel, closing a Channel, and
explicitly closing/joining a related set of Channels.

Acceptance:

- Channel IDs are stable within the owning Run and Phase Execution.
- Rowan does not interpret Channel payload or host protocol semantics.
- Channel events are distinguishable without becoming Tool Calls or Rowan
  Agents.
- No Channel remains implicitly detached after the parent Run terminates.
- Existing route-based serial and parallel Phase behavior is unchanged.

## Slice 5: Events, observation, and answer API

Extend live and durable Run events with normalized Interaction and Channel
activity. Add typed answer-by-Interaction-ID behavior to the public Run handle
while preserving the legacy `respond({ requestId, input })` projection.

Acceptance:

- Durable event ordering and observation cursors remain authoritative.
- Live-only activity can be dropped without breaking recovery.
- A caller can observe pending, answered, denied, cancelled, and expired
  transitions.
- Legacy one-shot input consumers remain behaviorally compatible.

## Slice 6: Cancellation and deadlines

Add failing examples for Run cancellation, Execution Attempt cancellation,
Interaction cancellation, deadline expiration, and Channel shutdown. Connect
the driver signal to the existing cancellation path without indefinite waits.

Acceptance:

- Cancellation prevents new Interaction or Channel work.
- Pending Interactions become cancelled where Rowan owns their state.
- The driver observes the owning Run/Attempt abort signal.
- Deadline expiration is explicit and observable.
- Ambiguous external effects do not trigger automatic retry.

## Slice 7: Compatibility and delivery verification

Run focused Phase, input, checkpoint, Store, event, cancellation, and public
interface tests; then run typecheck, package build, the complete Rowan suite,
and `git diff --check`. Update Phase and Runtime docs and record the released
version only after the implementation is complete.

Acceptance:

- Existing serial, parallel, Tool, routing, input, and recovery tests pass.
- InMemory and SQLite Store behavior matches.
- Public package exports and generated declarations contain the approved
  generic API only.
- `packages/agent/docs/phase-interactions.md` matches the shipped contract.
- Host integrations can consume the new seam without Rowan-specific protocol
  dependencies.
