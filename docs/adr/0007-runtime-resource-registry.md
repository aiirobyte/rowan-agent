---
status: accepted
---

# Put executable resource registration behind the Rowan Runtime Resource Registry

Rowan will expose one Runtime Resource Registry as the public seam for
registering Agent Definitions, Tools, Skills, Phases, and Extensions. The
Registry is a deep Module: hosts provide explicit resource inputs, while Rowan
owns normalization, name validation, collision handling, selection, execution
dispatch, per-Run snapshots, and recovery behavior.

The host calls `loadAgents`, `loadTools`, `loadSkills`, `loadPhases`, and
`loadExtensions` explicitly after starting Rowan. The host does not construct
an `AgentConfig.resources` candidate bag, independently resolve an Agent
Definition, or invoke a registered Tool itself. `load*` commits its own source
immediately and returns a structured result. `unload({ kind, sourceId })`
removes one source's complete contribution set.

Each load input has a stable `sourceId` and may include a resource-type
directory, inline values, or both. Rowan owns the file parsing and normalizes
both forms to one internal registration representation. Tool code is the
exception: `loadTools` accepts only inline values, so a configuration directory
cannot dynamically introduce an arbitrary executable Tool. A repeated
`load*` for the same kind and `sourceId` replaces that source's contribution
set; different sources may not contribute the same name in the same kind.

Tools and Phases are executable resources with a shared invocation shape but
different declared outputs. A Tool value carries `manifest + execute`; a Phase
value carries `manifest + run`. Their functions remain host-defined code,
while Rowan validates input/output schemas, creates the durable invocation,
passes Rowan-native invocation data, controls cancellation and retries, and
persists the outcome. The handlers receive no host Scope or host business
types. A retry is opt-in in the Manifest; the default is no automatic retry.

Agent Definitions, Workflows, and Phases may select Tools, Skills, and Phases.
An omitted selection inherits the current candidates, `[]` selects none, and a
present list narrows by name. Every lower configuration layer can only narrow
the set it received. Missing names remain warning-and-skip diagnostics. The
`extensions` field is removed from these documents: Extensions are global
Runtime modules, not Agent/Workflow/Phase capabilities.

Extensions are loaded and activated before any Agent or Run exists. They may
alter supported Runtime behavior and may explicitly contribute Tools and
Phases through a constrained, versioned Extension API. Rowan attributes those
contributions to the activating Extension and rolls them back if activation
fails. An Extension failure is recorded and skipped; other Extensions may
continue. A successful Extension stays active for the whole Runtime lifetime,
is disposed in reverse activation order on close, and cannot be loaded,
unloaded, or replaced after the first Agent or Run. Such changes require a
Runtime restart.

Rowan's own core Tools and the `default` Phase are registered as reserved
Runtime contributions. Any same-kind collision, including one with a core
resource or `default`, is a hard error: the attempted `load*` call makes no
new commit and its previous successful source contribution remains intact.
Malformed individual file resources are skipped with diagnostics; a collision
is not a malformed-item diagnostic and never silently skips or overrides a
name.

At every new Run, Rowan rereads registered non-Extension directory sources,
resolves the Definition and all selected resources into one consistent
Configuration Snapshot, and persists that snapshot in its Durable Store. An
active or input-waiting Run stays pinned. If a new reread finds a hard name
collision, that new Run fails rather than falling back to stale resources. On
process restart the host registers sources again; Rowan does not persist paths
or host functions. A resumed Run uses the currently registered same-name host
function while retaining its persisted declarative/file snapshot for audit.

Context Candidates remain per-Agent/Run JSON-safe inputs, rather than global
Registry resources. Hosts pass them with Agent configuration; Rowan selects and
snapshots them using the Definition's existing generic Context selection.

This supersedes ADR-0005's per-Agent Extension assembly and Agent/Phase
`extensions` selection. It amends ADR-0006 only by removing Extension from the
Definition resource vocabulary; Context and PhaseRegistry selection remain
active.

## Consequences

- `AgentRuntime` gains a small, explicit registration Interface and becomes
  the only caller-visible Resource resolution seam.
- Hosts retain ownership of their domain implementation code and runtime
  parameters, but no longer duplicate Rowan resource loading, selection,
  collision, snapshot, or dispatch logic.
- The Runtime does not expose a general Catalog/diagnostics query API. Each
  `load*` result is the inspection surface for that registration attempt.
- Existing hosts must replace direct `AgentConfig.resources` construction and
  per-Agent Extension loading with explicit Registry calls and a Definition
  reference.
- There is no compatibility parser or migration behavior for the removed
  `extensions` field. Hosts clean existing authored files as part of their
  coordinated upgrade.

## Rejected options

- A public `ResourceSource` abstraction: rejected because callers need only
  explicit `load*` inputs; directory and inline normalization are Rowan
  implementation details.
- Separate Tool and Phase registration subsystems: rejected because their
  registration, validation, invocation, snapshot, and recovery concerns are
  the same despite their different outputs.
- Passing host Scope or opaque host bindings through Rowan: rejected because
  it teaches Rowan host business concepts and duplicates host ownership.
- Per-Agent Extension activation: rejected because an Extension API can alter
  whole-Runtime behavior and cannot be safely isolated to one Run.
- Host-side Catalog polling: rejected because it would recreate a second
  resource authority and is not currently needed by callers.
