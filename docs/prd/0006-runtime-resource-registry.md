# PRD: Runtime Resource Registry

## Status

Approved for implementation. This PRD implements
[ADR-0007](../adr/0007-runtime-resource-registry.md), supersedes the
per-Agent resource candidate assembly in PRD-0004, and amends PRD-0005 by
removing Definition-level Extension selection.

## Problem

Today a host loads files, creates concrete Tool/Phase closures, assembles
candidate resources into every `AgentConfig`, and asks Rowan to select them.
Extensions are also assembled per Agent Config. This makes hosts duplicate
loading and collision behavior, prevents one Runtime-wide view of executable
resources, and makes a source change hard to apply consistently to the next
Run while preserving active Run snapshots.

## Outcome

Rowan owns one Runtime Resource Registry. Hosts explicitly register resource
inputs through typed `load*` methods. Rowan resolves registered resources on
each new Run, dispatches registered Tool/Phase implementations, and stores the
resolved snapshot. Host code still defines domain Tool/Phase behavior and
passes normal runtime options and Context Candidates, but it no longer owns
resource selection, collisions, file parsing, or executable snapshot assembly.

## Module Interface

The public Runtime Interface is intentionally small:

```ts
type ResourceKind = "agent" | "tool" | "skill" | "phase" | "extension";

type LoadInput<T> = Readonly<{
  sourceId: string;
  directory?: string;
  values?: readonly T[];
}>;

type LoadResult = Readonly<{
  revision: string;
  registered: readonly ResourceRef[];
  skipped: readonly ResourceDiagnostic[];
}>;

interface AgentRuntime {
  loadAgents(input: LoadInput<AgentDefinition>): Promise<LoadResult>;
  loadSkills(input: LoadInput<Skill>): Promise<LoadResult>;
  loadPhases(input: LoadInput<PhaseContribution>): Promise<LoadResult>;
  loadExtensions(input: LoadInput<ExtensionContribution>): Promise<LoadResult>;
  loadTools(input: Readonly<{
    sourceId: string;
    values: readonly ToolContribution[];
  }>): Promise<LoadResult>;
  unload(input: Readonly<{ kind: ResourceKind; sourceId: string }>): Promise<LoadResult>;
}
```

Every input requires `sourceId` and at least one of `directory` or `values`.
For any load type that permits both, Rowan combines them before validating the
source. Directory parsing and inline-value normalization are private
implementation details of the corresponding `load*` method. `loadTools` does
not accept `directory`.

The existing Agent creation/update Interface changes to accept a registered
Definition name plus Rowan-native execution parameters (`identity`, `cwd`,
model/stream, and Context Candidates). It does not accept concrete Tools,
Phases, Skills, Extensions, host Scope, host bindings, or executable closures.

### Executable Contributions

```ts
type InvocationContext = Readonly<{
  agentId: AgentId;
  runId: RunId;
  invocationId: string;
  attempt: number;
  signal: AbortSignal;
  startedAt: string;
}>;

type InvocationOutcome<T> =
  | Readonly<{ status: "completed"; output: T }>
  | Readonly<{ status: "input_required"; request: InputRequest }>;

type ToolContribution = Readonly<{
  manifest: ToolManifest; // name, description, input/output schemas, retry policy
  execute(input: JsonValue, context: InvocationContext): Promise<InvocationOutcome<JsonValue>>;
}>;

type PhaseContribution = Readonly<{
  manifest: PhaseManifest; // name, description, content, input/output schemas, selections
  run?(input: JsonValue, context: InvocationContext): Promise<InvocationOutcome<PhaseOutput>>;
}>;
```

Rowan validates the declared input and output schemas before and after each
call. A file-only Phase uses Rowan's declarative Phase behavior; an inline
Phase may provide `run`. Tool/Phase functions are host-defined code. Rowan
calls them directly through its dispatcher and owns durable invocation state,
cancellation, input suspension, attempt counting, and result persistence.
Errors use Rowan's structured invocation failure contract. Automatic retries
are disabled unless a Manifest explicitly enables a safe retry policy.

## Requirements

### R1: Registry lifecycle and source ownership

- The host explicitly calls each `load*` after `AgentRuntime.init()`.
- Every successful call commits only that kind + sourceId contribution set and
  returns `LoadResult`.
- Repeating a call for the same kind + sourceId replaces that source's full
  contribution set. `unload` removes it.
- Rowan does not persist registration paths or host functions. The host repeats
  its registrations on each Runtime start.
- There is no public list-Catalog or list-diagnostics method in this release.

### R2: Names, diagnostics, and load failure

- Rowan validates one shared, path-safe resource-name grammar for every kind.
- Names are unique within their kind. Cross-kind equal names are valid.
- Rowan's core Tools and `default` Phase occupy the same relevant namespaces.
- A duplicate is a hard error: the entire attempted `load*` call makes no
  commit, and the previous same-source contribution set remains available.
- Invalid or unreadable individual directory resources are skipped and reported
  in `LoadResult`; a missing directory is an empty source with a diagnostic.
- An explicitly selected missing name warns and is skipped during resolution.

### R3: Definition and selection model

- `AgentDefinition` and common Phase/Workflow frontmatter retain named
  `tools`, `skills`, `phases`, and `context` fields where they already apply.
- Remove `extensions` from Agent Definition and common Phase/Workflow
  frontmatter. Do not retain a compatibility parser or migration path.
- Omitted selections inherit all current candidates, `[]` selects none, and
  present names select matching candidates.
- Lower Agent/Workflow/Phase selections intersect with, and can only narrow,
  the selections already granted above them.
- Context Candidates stay as JSON-safe per-Agent/Run configuration input; they
  are not Registry resources.

### R4: New-Run resolution and snapshots

- Before every new Run, Rowan rereads every registered non-Extension directory
  source and resolves the Definition, candidates, and Context into one
  consistent Configuration Snapshot.
- A new Run encountering a duplicate collision fails rather than using a stale
  Catalog. A malformed individual resource is skipped according to R2.
- Active and input-waiting Runs remain pinned to their persisted snapshot.
- Rowan persists the selected declarative/file snapshot in its Durable Store.
- After process restart, a resumed Run uses the current registered same-name
  host Tool/Phase implementation; Rowan does not promise executable function
  byte identity across deployments.

### R5: Global Extensions

- Rowan registers core capabilities first. Hosts must load Extensions before
  creating the first Agent or Run; afterward `loadExtensions` and Extension
  `unload` are rejected until Runtime restart.
- A loaded Extension is active for the whole Runtime lifetime, rather than
  selected by any Agent, Workflow, or Phase.
- `ExtensionContribution.activate(api)` receives a constrained, versioned
  Extension API. It may register supported hooks, providers, Tools, and Phases
  through explicit `api.loadTools` and `api.loadPhases` methods.
- Rowan attributes each such contribution to the Extension. Successful
  extension-local loads commit immediately; if activation later fails, Rowan
  rolls back all of that Extension's contributions and invokes cleanup.
- One Extension's parse/activation failure is diagnosed and skipped; it does
  not prevent other Extensions from activating.
- A successful activation returns or registers a disposer. Rowan invokes
  disposers in reverse activation order during orderly close; cleanup failures
  are diagnosed without stopping further close processing.

### R6: Consistency

- Registry updates and new-Run snapshot construction are serialized so a Run
  sees either the prior complete source set or the new complete source set,
  never a mixture.
- The Registry is Rowan's only resource-resolution seam. Hosts do not
  independently invoke file loaders to prepare concrete candidate bags.

## Non-goals

- A general ResourceSource class or callback-based loader API
- Tool code dynamically imported from a configuration directory
- A sandbox for Extension code
- Host Scope, Project, Task, Workflow, or other business models in Rowan
- A runtime-wide resource/Catalog query API
- Persisting host Tool/Phase functions or source registrations
- Compatibility parsing for Definition/Workflow/Phase `extensions`

## Acceptance

- Public-interface tests prove only the Registry loading/unloading and
  Definition-reference Agent configuration seams are exported.
- Tests prove directory + values normalization, source replacement/unload,
  individual invalid-item diagnostics, hard duplicate rollback, reserved core
  collisions, and cross-kind name coexistence.
- Tool/Phase tests prove schema validation, shared invocation context,
  input-required outcomes, default-no-retry behavior, and explicit retries.
- Resolution tests prove omitted/empty/named and monotonic narrowing semantics,
  missing-name diagnostics, Context independence, and removed Extension
  selectors.
- Lifecycle tests prove per-new-Run rereads, coherent snapshots under concurrent
  source updates, durable snapshot pinning, and restart recovery with current
  host handlers.
- Extension tests prove Extension-first locking, Runtime-wide activation,
  constrained API registration, failure rollback/skip, disposer ordering, and
  restart-required changes.
- Package tests, typecheck, build, public-interface check, and diff check pass.
