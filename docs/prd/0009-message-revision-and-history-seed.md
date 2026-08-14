# PRD: Message Revision and History Seed

## Status

Implemented locally; package release remains a separate action. This document
is the accepted implementation plan for
[ADR-0010](../adr/0010-message-revision-and-history-seed.md).

## Problem

Rowan's Canonical Messages are append-only, so a host that edits an earlier
user entry must create a duplicate Run or rebuild an entire Agent. Hosts need
one durable seam that revises the active Message while fencing the invalid
execution suffix. They also need to seed a new Agent with copied active
context without linking it to the source Agent.

## Requirements

- Keep the same `MessageId` and increment a monotonic `messageRevision`.
- Append an immutable `message_revised` Durable Run Event; active history
  returns the latest revision only.
- Atomically compare the expected Message revision, fence/cancel all active
  suffix Runs, remove invalid active Messages from the model projection, and
  create one replacement Run from the pinned fork-point Configuration Snapshot.
- Return a revision conflict without changing the supplied draft.
- Fence late execution writes with a revision/execution token.
- Expose affected Tool Calls and a deterministic effect digest. Require the
  caller to confirm that exact digest when external effects may have occurred;
  running Tool Calls become indeterminate rather than silently replaying.
- A replacement Run may fail after the revision commit; the revised Message
  remains active and the old content is not restored.
- Accept an optional history seed when creating a new Agent. The seed is
  validated active model context with newly allocated Message identities; it
  contains no source Agent, Run, Event, Checkpoint, or idempotency identity.
- History seed creation does not enqueue a Run.
- Existing unsupported runtime data is not migrated. A fresh schema is the
  only supported store format for this cutover.

## Acceptance

- Memory and SQLite adapters pass the same revision CAS, suffix fence,
  late-write, effect-confirmation, pinned-config, and history-seed tests.
- Public snapshots and history expose stable Message identity plus revision.
- Event consumers observe one revision fact and receive `cursor_expired` after
  cleanup removes their cursor range.
- Typecheck and package tests pass before the Rowan version is bumped to
  `0.10.0`.
