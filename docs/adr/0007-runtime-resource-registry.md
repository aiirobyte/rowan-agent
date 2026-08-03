---
status: accepted
---

# Put scoped Configuration Snapshot resolution behind the Runtime Resource Registry

Rowan will expose one Runtime Resource Registry as the public seam for
registering Agent Definitions, Tools, Skills, and Phases. A registration creates
an atomically replaceable Resource Source; it does not create one Runtime-global
candidate set. Hosts explicitly select opaque Source IDs in each Agent
Configuration's Resource View, so unrelated host scopes may reuse the same
resource name without teaching Rowan their business model.

Each `load*` input has a stable `sourceId` and may include the supported
resource-type directory, inline values, or both. A private Registry Source
Transaction normalizes both forms, validates shared path-safe names, diagnoses
invalid individual files, and atomically replaces the source's complete prior
revision. A duplicate inside the merged source, or a collision with an implicit
core resource, rejects the whole transaction and preserves the previous
revision. Cross-source duplicates may be registered because they might never be
visible together.

The Runtime Configuration interface accepts a registered Definition name, an
explicit Resource View, Context Candidates, and normal execution options. It
may also accept one declarative Definition Layer that replaces authored content
or model and narrows Tool, Skill, and Phase selections. The layer cannot add a
source, Context Candidate, executable value, or host Scope. This gives hosts a
generic input for Workflow-like configuration without adding Workflow to
Rowan's domain.

Before every new Run, one Configuration Snapshot Resolver serializes against
Registry updates, rereads every directory in the Resource View, and resolves a
coherent snapshot. A duplicate across sources in that view is a hard resolution
failure; a source outside the view is irrelevant. Definition, optional layer,
and Phase selections are monotonic: omission preserves the parent set, `[]`
selects none, and a present list intersects by name. The snapshot records source
revisions, declarative/file values, selected Context, and executable references
as `(kind, sourceId, name)`.

An active or input-waiting Run remains pinned to its Configuration Snapshot.
After process restart the host registers sources and functions again. Rowan
rebinds a persisted executable reference only to the current handler with the
same kind, Source ID, and name; it never silently binds a same-name handler from
another source or falls back to a stale directory revision.

Tools and Phases are registered executable contributions but do not share a
synthetic durable invocation model. A Tool contribution enters Rowan's existing
durable Tool Call reservation/result/cancellation/indeterminate-effect path. A
Phase contribution enters the existing Phase Context, Phase Execution,
routing, input boundary, and Run checkpoint path. Their registration can share
private source normalization and handler lookup, but their public callbacks,
outcomes, retry semantics, and persisted state remain distinct.

Both callback paths receive Rowan-native identity plus immutable generic Agent
and Run Metadata. A host may interpret that Metadata in its own Adapter and
reload current business facts; Rowan does not accept or persist host Scope,
Project, Task, Workflow, path bindings, or arbitrary dependency closures.

Extensions use a separate bootstrap-only interface. `AgentRuntime.init()`
opens Runtime ownership but does not start the Scheduler, recover queued work,
or return a usable Runtime until its bootstrap callback has registered required
sources/handlers, loaded Extensions, and completed. The callback's
`loadExtensions` capability is invalidated afterward. Non-Extension sources may
still be atomically replaced or unloaded on the ready Runtime.

Extensions are global Runtime modules and implicit in every Resource View. They
may register constrained hooks, providers, Tools, and Phases through a
versioned API. Rowan attributes every contribution to its Extension, rolls all
of them back if activation fails, and reports a diagnostic so other Extensions
may continue. Successful Extensions are frozen for the Runtime lifetime and
disposed in reverse activation order. If bootstrap itself throws, Rowan rolls
back activated Extensions and releases ownership without starting the
Scheduler.

Rowan core Tools and the `default` Phase are implicit reserved contributions.
The Runtime exposes no general Catalog query interface: `LoadResult` reports
each source transaction, while Configuration resolution reports view-specific
diagnostics.

This supersedes ADR-0005's concrete per-Agent resource/Extension assembly and
Agent/Phase `extensions` selection. It amends ADR-0006 only by removing
Extension from Definition resource vocabulary; Context and PhaseRegistry
selection remain active.

## Consequences

- `AgentRuntime` gains explicit non-Extension source transactions, a
  bootstrap-only Extension interface, and Definition-reference Agent
  configurations with Resource Views.
- Same names can coexist across isolated views; collisions are checked at the
  smallest truthful locality: source transaction or resolved view.
- Configuration snapshotting, reread consistency, selection, persistence, and
  restart handler rebinding have one owner.
- Hosts retain domain implementations and visibility decisions without passing
  concrete candidates or business bindings.
- Scheduler readiness now guarantees restored Runs cannot execute before
  startup handlers and Extensions exist.
- Tool Call durability and Phase checkpoint/routing semantics remain separate.

## Rejected options

- One Runtime-global name namespace: rejected because a shared Runtime may host
  mutually isolated source views with legitimate same-name resources.
- A callback-based or generic public `ResourceSource` object: rejected because
  explicit typed `load*` inputs and opaque Source IDs are sufficient.
- A Workflow resource kind: rejected because a generic Definition Layer closes
  the narrowing seam without teaching Rowan a host orchestration concept.
- Starting the Scheduler in `init()` and loading Extensions afterward: rejected
  because recovered queued Runs can execute before Extension activation.
- One shared durable `InvocationContext/Outcome` for Tools and Phases: rejected
  because Tool Calls and Phase Executions have different persistence, retry,
  input, routing, and indeterminate-effect semantics.
- Passing host Scope or executable closures through Agent Configuration:
  rejected because it duplicates host authority and prevents durable rebinding.
- Per-Agent or per-view Extension activation: rejected because an Extension can
  alter the whole Runtime and cannot be isolated truthfully.
- Host-side Catalog polling: rejected because it recreates a second executable
  authority.
