# Event-driven Agent Runtime issue slices

Status: In Progress

Progress: Rowan 0.8 has completed the event-driven public cutover and the
EverYield consumer migration. Slice 9 now atomically reserves all Tool Calls
from one model response in one Assistant Tool-use Message and preserves
provider correlation IDs for restart-safe Model Context projection. Slice 11
now hardens JSONL append/recovery behavior, paginates CLI read models, and
reports actionable old-database recovery guidance. Slice 12 now exposes the
durable Agent/Run/Execution identity to Phase callbacks, and EverYield derives
retry-stable Workflow Agent/Run idempotency keys from that identity. EverYield
also persists a Team-scoped Workflow launch outbox and replays unfinished
launches during Runtime startup. Input Request Phase provenance is now
persisted and exposed consistently through snapshots, boundaries, and durable
transition events.

Remaining acceptance work includes the full cross-Store fault-injection and
outbox coverage described by Slice 12.

Source: [PRD-0003](../prd/0003-event-driven-agent-runtime.md)

Decision: [ADR-0004](../adr/0004-event-driven-agent-runtime.md)

These slices are ordered to keep one coherent implementation and one authoritative test surface. Temporary adapters may keep the branch compiling between slices, but no compatibility facade ships.

## Slice 1: Freeze the executable specification

Define public types, the Run transition table, Run/Message/Input Request/Tool invariants, Runtime and Run failure details, JSON-safe validation, and canonical request encoding.

Acceptance:

- public types cannot represent invalid terminal or input-required snapshots;
- `UserInput` cannot choose a Message role or identity;
- Input Request prompts and completed Run outputs are statically restricted to
  `AssistantMessage`; an output ID must reference an already-committed
  Assistant Message from the same Agent and Run;
- Runtime-specific Message, Outcome, Tool-result, and Tool-content DTOs are
  readonly, JSON-safe, and cannot mix provider correlation IDs with durable
  Tool Call IDs;
- Tool definitions preserve the existing TypeBox `Type.TSchema` parameter
  contract, while its provider projection and all model argument/result values
  are validated as JSON-safe;
- Run Failure and Runtime Error are separate;
- `isRuntimeError()` narrows the code/details discriminated union;
- `AgentConfig.identity` is the stable cross-restart comparison contract for
  executable configuration;
- Tool execution context carries captured Agent/Run IDs and Rowan's durable
  Tool Call ID;
- `agentSequence`, `readySequence`, revision, cursor, and idempotency semantics
  have one name and one definition, including disjoint full scopes for Agent
  creation, configuration update, and Run start;
- table-driven tests cover every allowed and rejected state transition;
- pure Run Event DTOs live in `agent` and are exposed through the Runtime
  internal entrypoint, keeping the deliberate `logging → agent` boundary;
- vNext declarations compile through an internal entrypoint or golden fixture;
  the `agent` root re-export and exact public export-set switch are deferred to
  Slice 10.

## Slice 2: Extract the one-shot execution module

Replace the pending `waitForInput()` continuation with an internal execution interface that returns one input or terminal boundary. Separate immutable Canonical Messages from execution-local Model Context.

Acceptance:

- one execution call returns `input_required`, `completed`, or `failed` without retaining a Promise continuation;
- checkpoint codec/version validation is explicit;
- first-execution Phase selection derives from durable input rather than process memory;
- Phase prompts, snapshot/restore, and compaction mutate only Model Context;
- Message streaming allocates the eventual Canonical Message ID before deltas;
- execution configuration/ports and `AgentBindingOptions`/`AgentRunControl`
  equivalents no longer import from the public `Agent` facade;
- the one-shot executor, checkpoint, and extension hook ports contain no
  Session identity or legacy `AgentEvent` bridge; run/execution lifecycle
  events replace `agent_start/agent_end`, with translation isolated in the
  temporary old-Runtime adapter;
- `loadSkills`, `loadPhases`, and `loadExtensions` have standalone homes before
  the facade is deleted;
- old Runtime behavior can use a temporary internal adapter until the public cutover.

Depends on: Slice 1.

## Slice 3: Define Store vNext and implement MemoryStore

Create the semantic `DurableStore`/owner-bound Store seam, schema-neutral records, JSON limits, idempotency, Run revision, Execution Token, Config Token, and event transaction contract.

Acceptance:

- Store methods express complete domain transitions rather than table writes;
- Agent provisioning and configuration updates are recoverable and idempotent;
- queued input is promoted to a Canonical Message only by first claim;
- every aggregate transaction increments revision once and emits a fixed event sequence;
- every semantic write has a preallocated natural intent identity; fault
  injection after commit but before response replays the original
  postcondition with no duplicate revision/Event or external reinvocation;
- stale owner and stale Execution Tokens fail every mutation;
- MemoryStore passes state, concurrency, idempotency, snapshot, cursor, and fault-injection contracts;
- vNext Store types and adapters remain side-by-side with the old
  `RuntimeStateStore` until the atomic public cutover, so intermediate commits
  build without weakening either contract.

Depends on: Slice 1.

## Slice 4: Implement SQLite vNext and ownership

Build the new schema, Store-version gate, owner lease/heartbeat, atomic takeover/seal, SQLite cursor allocation, constraints, and two-connection concurrency tests.

Acceptance:

- unsupported non-empty databases are rejected before DDL or DML;
- an empty database initializes the current schema;
- adapter construction performs zero DDL/DML; only `openOwner()` after a
  read-only schema inspection may initialize a genuinely empty database;
- unsupported-store tests compare the pre/post table catalog and database
  bytes to prove rejection did not mutate the file;
- two connections racing for ownership produce exactly one live owner;
- every clean or expired reacquisition increments the persisted epoch;
- one initialization retries `openOwner()` with the same Owner ID and recovers
  the original token after a success-unknown response;
- an expired owner cannot renew or write before takeover because every
  transaction checks Store time against lease expiry;
- expired takeover atomically fences the prior epoch, resolves its Tool Calls, terminates its running Runs, emits events, and installs the new owner;
- partial unique constraints enforce one active Run and one open Input Request;
- SQLite never uses `MAX()+1` for Run or Event sequence allocation;
- Memory and SQLite pass the same Store contract;
- vNext SQLite uses a distinct schema/version path and never opens an old
  Runtime database through the legacy adapter.

Depends on: Slice 3.

## Slice 5: Add Config Provider provisioning and read models

Implement restart-resolvable immutable Config Tokens, identity-based
idempotency, available/deferred/unavailable resolution, an owner-bound
provisioning/config command service, and Agent/Run keyset pagination. Slice 6
wires these pieces into the public Runtime skeleton.

Acceptance:

- creation and update retries recover the same operation after response loss;
- completed Agent creation replay does not mutate configuration;
- same operation and Config identity returns one token while a different
  identity conflicts;
- Provider returns a raw token through typed `stored/identity_conflict`
  results; Runtime validates/brands it, and operation mappings are retained for
  the Store incarnation;
- concurrent updates are last-Store-commit-wins and replaying an older success
  does not revert the current token;
- issued tokens resolve after restart and are retained;
- Provider retry hints and malformed/error responses follow the PRD;
- Agent pagination uses activation order and both list cursor types reject
  Store, collection, or filter mismatch;
- public read models need no direct Store-table access.

Depends on: Slices 3–4.

## Slice 6: Deliver the minimal vertical Run and FIFO Scheduler

Implement `init → createAgent → start → claim → execute → wait(completed)`, Store-authoritative scheduling, level-trigger wakeup, global concurrency, per-Agent FIFO, and stateless Run handles.

Acceptance:

- `start()` commits Run and idempotency before returning;
- `start()` requires a key; same key plus the same canonical request returns
  the same Run, while a changed request conflicts;
- `runtime.run(id)` performs zero I/O or registration, separate handles share
  no mutable cache, and the first I/O reports `run_not_found`;
- input becomes canonical at first claim exactly once;
- 100 concurrent starts allocate unique FIFO positions;
- one Agent is serial while different Agents reach configured concurrency;
- two Runtimes may coexist in one process for different Stores; only Store
  ownership, not a process-global singleton, rejects a second owner;
- a lost wakeup cannot strand a queued Run;
- never-started Runs resolve the current Config Token; deferred lookup uses
  capped per-Agent retry without blocking other Agents, while unavailable
  configuration becomes a durable failure;
- claim and unavailable-failure transactions CAS the token/revision used by
  out-of-transaction resolution, so an old Provider result cannot fail a Run
  after concurrent config update;
- Config lookup concurrency is separately bounded, its timeout/Abort path does
  not consume Run slots, and no Provider call occurs inside a Store
  transaction;
- heartbeat renews work spanning multiple lease periods; renewal failure stops
  claims, gates transients, aborts local attempts, and makes every later write
  fail its owner fence;
- `wait()` is implemented through durable snapshot and events;
- a basic close transaction fences/fails active tool-free attempts, releases
  ownership, is retry-idempotent, and never waits on the execution Promise;
- Runtime restart can open a known terminal Run ID after the prior owner closes.

Depends on: Slices 2–5.

## Slice 7: Add Input Request and pinned resume

Implement atomic input boundary commit, natural request-answer idempotency, ready requeue, checkpoint compatibility, and restart recovery.

Acceptance:

- entering input-required leaves no live continuation or occupied execution slot;
- prompt, request, checkpoint, pinned token, state, revision, and events are atomic;
- the non-empty requesting Phase ID survives Runtime restart and is exposed by
  the Input Request snapshot and boundary;
- `start()` during input-required queues a later Run;
- same request and answer replays successfully; a different answer conflicts;
- unsupported checkpoint or unavailable pinned configuration leaves the request open;
- `respond()` after Config resolution CASes the exact revision, request ID,
  pinned token, and checkpoint header; a lost race writes no answer and
  replays from durable request state;
- successful answer resumes with the pinned Configuration Snapshot;
- an already-answered queued Run with an unsupported checkpoint or unavailable
  pinned configuration is durably failed without blocking Runtime init;
- repeated input boundaries within one Run remain recoverable.

Depends on: Slice 6.

## Slice 8: Add observation and reliable consumption

Implement atomic snapshot/cursor reads, durable replay-to-live observation, bounded transient delivery, terminal iterator behavior, reliable consumer checkpoints, catch-up barriers, retry, and cancellation.

Acceptance:

- all durable Event payloads match the public discriminated union;
- `running → input_required` events expose the same requesting Phase ID as the
  corresponding snapshot and boundary;
- snapshot plus cursor produces no replay gap;
- terminal at or before `after` yields an empty completed iterator;
- final Message commits reconcile dropped deltas;
- queued local transients are dropped at a boundary; a stale cross-owner
  transient may precede the terminal Event, but nothing is yielded after that
  durable boundary;
- failed listener delivery retries the same Event with unchanged checkpoint;
- catch-up, AbortSignal, Runtime close, and ownership loss settle `caughtUp/done` as specified;
- delivery receives a cooperative AbortSignal, and a Consumer ID is not
  reusable until its in-flight listener settles and `done` finishes;
- the required registration signal aborting before the Store linearization
  makes `consume()` reject and releases the Consumer ID; after it, handle
  lifecycle owns stopping;
- crash-before-checkpoint plus idempotent target start creates one target Run.

Depends on: Slices 4, 6–7.

## Slice 9: Add Tool lifecycle, cancellation, and seal/takeover races

Move Tool Message generation and commit under Runtime ownership. Add
pending/running distinctions, determinate failure, indeterminate failure, Run
cancellation, extend the base close/takeover seal for Tools, and fence late
writes.

Acceptance:

- Tool-use Message and pending Tool Call are durable before waiting for capacity;
- canonical Messages and Tool adapters use Rowan durable Tool Call IDs, while
  Model Context projection consistently maps both Tool-use and Tool-result
  blocks to the stored provider correlation ID;
- Tool adapter is invoked only after `running` is durable;
- policy denial and cancellation before the durable `pending → running`
  invocation point are determinate;
- before-hook denial/error/timeout is determinate, while after-hook
  error/timeout/invalid output is indeterminate and terminal;
- malformed, non-JSON-safe, or oversized adapter results after the invocation
  point are indeterminate and terminal;
- every ambiguous outcome after that durable invocation point is indeterminate
  and terminal;
- Tool terminal state, model-visible result Message, Run terminal state when applicable, and events are atomic;
- when one parallel Tool terminates the Run, the same transaction resolves
  every remaining pending/running Tool and records every indeterminate ID;
- cancel versus Tool result, close versus outcome, and takeover versus callback have one valid result;
- `close()` does not wait indefinitely for user-controlled Promises.

Depends on: Slices 4, 6–8.

## Slice 10: Atomically cut over Rowan and all in-repo consumers

In one build-green cutover, switch exports to
`AgentRuntime`/`AgentRun`, standalone resource loaders, Config Provider,
Runtime read models, and Run Events. Migrate every source and test included by
the root TypeScript build—including CLI, logging, and JSONL—before deleting old
Runtime, Agent, Session, Mailbox, Lease, and callback interfaces with no aliases.

The CLI Config Provider persists a content-addressed immutable manifest for
each token and reconstructs executable configuration through the standalone
loaders after restart. It never serializes closures; referenced executable
modules/artifacts must remain version-addressable. Missing or digest-mismatched
artifacts resolve as `unavailable`, leaving an open Input Request cancellable.

Acceptance:

- TypeScript build and public-interface checks pass;
- the exact public export allowlist changes only in this slice;
- source and tests no longer use deleted public concepts;
- CLI commands persist Agent ID, Run ID, request ID, and operation
  idempotency keys before issuing commands;
- reopening a workspace detects a changed immutable config identity and
  idempotently calls `updateAgentConfig()` instead of silently reusing the old
  token;
- logging exposes a pure Durable-Run-Event JSONL sink without importing
  `AgentRuntime`; agent/CLI owns `consume()` orchestration, preserving the
  `logging → agent` boundary;
- tests assert behavior through the new Runtime interface rather than private scheduler or Store helpers;
- old implementation tests are removed only after equivalent new interface tests pass.

Depends on: Slices 1–9.

## Slice 11: Harden projection, restart UX, and rollout docs

Complete fault/restart coverage for the already-cut-over CLI and JSONL
projection, then migrate examples, README, and old-database UX.

Acceptance:

- CLI restarts from completed and input-required Run IDs;
- CLI `list` and status do not inspect Store internals;
- a separate `list`/status process encountering a live owner renders the
  `runtime_already_owned` expiry/retry guidance instead of bypassing Store
  ownership;
- JSONL repairs a partial trailing line and tolerates duplicate complete Events;
- concurrent old/new-owner sink callbacks cannot interleave line bytes;
- examples and README show only the new lifecycle;
- old Runtime database files receive an actionable reset/new-file error.

Depends on: Slices 8, 10.

## Slice 12: Migrate EverYield and complete rollout

Implement a metadata-aware Config Provider adapter and migrate Runtime startup,
Team/Project/Workflow Agent creation, resource loading/validation, Run input,
result routing, state queries, cancellation, database bindings, commands, and
tests.

Acceptance:

- EverYield configuration builders resolve Config Tokens after restart;
- Provider reconstruction uses Agent metadata plus persisted immutable
  descriptors and captured values; executable closures never read mutable
  `parentAgentId` or active-Task variables, Tools use
  `ToolInvocationContext.agentId`, and task-binding changes publish a new
  Config Token;
- host state commits before `updateAgentConfig()` with an idempotency key
  derived from the stable host version or durable Tool Call ID; restart
  reconciliation completes missed updates while a pinned Run keeps its old
  snapshot;
- no Project Agent reconstruction or continuation layer is added;
- every cross-Store create/start operation first persists a stable host command
  or outbox row; Agent/Run keys derive from it and binding writes are
  idempotently replayable;
- fault injection after Rowan Agent creation but before host binding, and after
  child Run start but before parent phase commit, produces exactly one
  Agent/Run after recovery;
- Workflow router decisions are stable or recorded in a host outbox before
  target `start()`;
- every router explicitly maps `AssistantContent` to valid target
  `UserContent`; Rowan performs no role or content coercion;
- result delivery cannot globally block on a target waiting for input;
- completed, failed, and cancelled source Runs have explicit downstream
  delivery mappings;
- list queries consume every page and fetch `snapshot()` only when rich state
  is needed; tests cover more than 100 Runs;
- Input Request ID flows from the prompt boundary through the persisted command
  state into `run.respond()`;
- binding schema and resume commands move from Session ID to Agent/Run IDs, and
  the Runtime uses a new vNext database filename or gives an explicit reset
  error;
- fresh and restarted Project Agents spawn Workflow Runs with the captured
  correct parent Agent ID, while later task/config changes do not alter an
  already-pinned Run;
- old Rowan Agent and Session references are invalidated or rebuilt explicitly;
- downstream source contains no `Agent`, `reconstructAgent`, Session authority, Mailbox, Lease, or `RuntimeEventDisposition` usage;
- Rowan and EverYield full build/test suites pass.

Depends on: Slices 5, 8, 10–11.
