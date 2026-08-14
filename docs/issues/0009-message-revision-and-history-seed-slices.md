# Issue drafts: Message Revision and History Seed

Status: Implemented locally. Do not publish to GitHub or bump the package
version without a separate release request.

Source: [PRD-0009](../prd/0009-message-revision-and-history-seed.md)

Decision: [ADR-0010](../adr/0010-message-revision-and-history-seed.md)

## Dependency map

| Slice | Depends on |
| --- | --- |
| 1. Public revision records and events | - |
| 2. Memory Store revision transaction | 1 |
| 3. SQLite fresh schema and revision transaction | 2 |
| 4. History seed | 1-3 |
| 5. Retention floor | 1-3 |
| 6. Verification and release | 1-5 |

## Slice 1: Public revision records and events

Add failing public tests for `messageRevision`, `message_revised`, active
history, revision conflict, and execution fencing. Extend contracts and event
DTOs without exposing host Conversation types.

## Slice 2: Memory Store revision transaction

Implement expected-revision CAS, suffix fencing, Tool effect digest and
confirmation, pinned Configuration Snapshot, replacement Run reservation, and
failure-after-commit behavior through the public Runtime seam.

## Slice 3: SQLite fresh schema and revision transaction

Introduce the new schema version as a clean initialization path. Persist the
active Message projection, immutable revision facts, fences, and operation
idempotency atomically. Reject non-empty old databases before writes.

## Slice 4: History seed

Add Agent creation with validated active history seed. Allocate new Message
IDs, copy values by value, and prove that no source identity or Run is copied.

## Slice 5: Retention floor

Add cleanup age/cursor/Tool gates, hard deletion, cursor expiry, WAL checkpoint,
and incremental vacuum. Keep unresolved indeterminate Tool risk until manual
resolution or Agent deletion.

## Slice 6: Verification and release

Run Memory/SQLite contract tests, full package tests, typecheck, diff checks,
and release validation. Bump the package to `0.10.0`; EveryYield upgrades only
after the released package is available.
