# PRD: Scoped Runtime Resource Registry

## Status

Approved for implementation. This PRD implements
[ADR-0007](../adr/0007-runtime-resource-registry.md), supersedes the per-Agent
resource candidate assembly in PRD-0004, and amends PRD-0005 by removing
Definition-level Extension selection.

## Problem

Today a host loads files, creates concrete Tool/Phase closures, assembles
candidate resources into every `AgentConfig`, and asks Rowan to select them.
The first Registry proposal replaced that with one Runtime-global namespace,
which cannot represent isolated host scopes that reuse names. It also started
the Scheduler before Extension activation, omitted an input for Workflow-like
narrowing, and imposed one durable invocation abstraction on Tool Calls and
Phase Executions despite their different recovery semantics.

## Outcome

Rowan owns a Registry of atomically replaceable Resource Sources and resolves
an explicit Resource View into one Configuration Snapshot per new Run. Hosts
register resources once, select only opaque Source IDs, and may add a generic
Definition Layer for declarative narrowing. Runtime bootstrap activates global
Extensions before scheduling. Registered Tools and Phases reuse their existing,
separate execution lifecycles.

## Public module interface

```ts
type ResourceKind = "agent" | "tool" | "skill" | "phase";
type ResourceSourceId = string;

type LoadInput<T> = Readonly<{
  sourceId: ResourceSourceId;
  directory?: string;
  values?: readonly T[];
}>;

type LoadResult = Readonly<{
  revision: string;
  registered: readonly ResourceRef[];
  skipped: readonly ResourceDiagnostic[];
}>;

type ResourceView = Readonly<{
  agents: readonly ResourceSourceId[];
  tools: readonly ResourceSourceId[];
  skills: readonly ResourceSourceId[];
  phases: readonly ResourceSourceId[];
}>;

type DefinitionLayer = Readonly<{
  description?: string;
  prompt?: string;
  model?: ModelRef;
  tools?: readonly string[];
  skills?: readonly string[];
  phases?: PhaseRegistrySelection;
}>;

type AgentConfiguration = Readonly<{
  identity: string;
  definition: Readonly<{ name: string; layer?: DefinitionLayer }>;
  resourceView: ResourceView;
  contexts?: readonly ContextCandidate[];
  cwd?: string;
  maxAttempts?: number;
} & (
  | { model: ModelConfig; stream?: never }
  | { model: ModelRef; stream: StreamFn }
)>;

interface RuntimeResourceRegistry {
  loadAgents(input: LoadInput<AgentDefinition>): Promise<LoadResult>;
  loadSkills(input: LoadInput<Skill>): Promise<LoadResult>;
  loadPhases(input: LoadInput<PhaseContribution>): Promise<LoadResult>;
  loadTools(input: Readonly<{
    sourceId: ResourceSourceId;
    values: readonly ToolContribution[];
  }>): Promise<LoadResult>;
  unload(input: Readonly<{
    kind: ResourceKind;
    sourceId: ResourceSourceId;
  }>): Promise<LoadResult>;
}

interface RuntimeBootstrap extends RuntimeResourceRegistry {
  loadExtensions(input: LoadInput<ExtensionContribution>): Promise<LoadResult>;
}

const runtime = await AgentRuntime.init({
  store,
  async bootstrap(registry: RuntimeBootstrap) {
    // Register every source/handler needed by recovered Runs here.
  },
});
```

Every `LoadInput` requires a non-empty `sourceId` and at least one supported
input. Directory and inline values are normalized privately and committed as
one source transaction. `loadTools` accepts values only. All four Resource View
fields are required: omission must never mean accidental Runtime-global
visibility. Rowan core and successful Extension contributions are implicit in
every view.

`AgentRuntime.init` does not expose a Runtime to the bootstrap callback. When
the callback completes, Extension loading is frozen, the Scheduler starts, and
the ready Runtime is returned. The ready Runtime implements
`RuntimeResourceRegistry` but not `loadExtensions`.

### Executable contribution interfaces

Tool and Phase callbacks share only a Rowan-native identity carrier:

```ts
type RuntimeInvocationIdentity = Readonly<{
  agentId: AgentId;
  runId: RunId;
  agentMetadata?: Metadata;
  runMetadata?: Metadata;
}>;

type ToolInvocationContext = RuntimeInvocationIdentity & Readonly<{
  toolCallId: ToolCallId;
  reportProgress(progress: JsonValue): void;
}>;

type ToolContribution = Readonly<{
  manifest: Readonly<{
    name: string;
    description: string;
    parameters: TSchema;
  }>;
  execute(
    input: JsonValue,
    context: ToolInvocationContext,
    signal: AbortSignal,
  ): Promise<ToolExecutionResult>;
}>;

type PhaseExecutionIdentity = RuntimeInvocationIdentity & Readonly<{
  executionId: ExecutionId;
}>;

type PhaseContribution = Readonly<{
  manifest: PhaseConfig;
  run?(
    context: PhaseContext,
    execution: PhaseExecution,
  ): Promise<PhaseOutput | void>;
}>;
```

Tool contributions enter the existing durable Tool Call state machine. Phase
contributions enter the existing Phase loop and Run checkpoint. Rowan does not
add shared Invocation Outcome, output-schema, or retry-policy entities in this
feature. Generic Agent/Run Metadata is snapshotted into callback identity; Rowan
does not interpret it.

## Requirements

### R1: Runtime readiness

- Acquire Runtime ownership before invoking the bootstrap callback, but do not
  claim queued Runs, start the Scheduler, or return the Runtime until bootstrap
  completes.
- Make all startup registration methods available through the callback and
  invalidate the callback object when it returns.
- If bootstrap throws, roll back/dispose activated Extensions, release Runtime
  ownership, and return no Runtime.
- After readiness, allow non-Extension source load/replacement/unload and reject
  every Extension lifecycle operation until restart.

### R2: Registry Source Transactions

- Validate one shared path-safe grammar for Resource Source IDs and resource
  names.
- Parse and normalize the complete directory + values input before acquiring
  the commit lock; serialize only validation against the current Registry and
  atomic replacement.
- Repeating `(kind, sourceId)` replaces that source's entire contribution set;
  `unload` removes it. A failed transaction preserves its previous revision.
- Reject a duplicate inside the merged source and any collision with implicit
  core names. Permit same-kind duplicate names in distinct non-implicit sources.
- Skip malformed individual directory items with structured diagnostics. A
  missing/unreadable root commits an empty source plus diagnostics.
- Return an opaque committed revision, registered refs, and skipped diagnostics;
  do not expose a general Catalog query API.

### R3: Resource View resolution

- Require explicit Agent/Tool/Skill/Phase Source ID arrays on every Agent
  Configuration. Deduplicate repeated IDs without changing order.
- Resolve the Definition only from `resourceView.agents`; resolve each other kind
  from its matching IDs plus implicit core/Extension sources.
- Treat same-kind duplicates across sources in one view as a hard configuration
  failure. Sources outside the view cannot collide.
- An unknown or unloaded Source ID is a configuration failure, not an empty or
  stale source.
- Never pass a concrete Resource Candidate bag through create/update contracts.

### R4: Definition and selection model

- Remove `extensions` from Agent Definition and Phase frontmatter. Do not retain
  a compatibility parser or migration path.
- Resolve base Definition selections first, then an optional Definition Layer,
  then the active Phase. Omission preserves its parent, `[]` selects none, and a
  present list intersects with its parent by name.
- A Definition Layer may replace description/prompt/model and narrow
  Tool/Skill/Phase selections. It cannot select Context, change the registered
  Definition name, or widen the Resource View.
- Explicitly selected missing names produce snapshot diagnostics and are
  skipped. Context Candidates remain per-configuration JSON-safe input and are
  selected only by the base Definition.

### R5: Configuration Snapshot and recovery

- Before each new Run, reread all directory sources in that Agent's Resource
  View and build one coherent snapshot serialized against Registry commits.
- Persist the source IDs/revisions, resolved declarations, selected Context
  values, Definition Layer, and executable refs `(kind, sourceId, name)`.
- Pin active/input-waiting Runs. A later source replacement affects only a later
  Run; it never mutates an existing snapshot.
- Fail a new Run on reread collision/unknown source instead of using stale
  source state.
- After restart, rebind executable refs only to a currently registered handler
  with the exact kind + Source ID + name. Missing handlers make configuration
  unavailable; a same-name handler in another source is never substituted.

### R6: Tool registration and dispatch

- Register Tools only from inline contributions and include their Source ID in
  snapshot executable refs.
- Preserve existing Tool parameter validation, durable Tool Call reservation,
  progress, cancellation, result commit, idempotency, and indeterminate-effect
  behavior.
- Supply Agent ID, Run ID, Tool Call ID, generic Agent/Run Metadata, progress,
  and AbortSignal to the handler. Do not add host business types or closures.
- Do not add automatic Tool retry policy in this feature.

### R7: Phase registration and dispatch

- Normalize inline and file-backed Phases into source-qualified declarations
  and optional handlers without dynamically importing Tool code.
- Preserve current Phase Context, Phase Execution, routing, model invocation,
  input boundary, and Execution Checkpoint behavior.
- Supply source-qualified handler resolution and generic Agent/Run Metadata in
  `PhaseExecutionIdentity`.
- Do not create a durable Phase Call record, Tool-like retry policy, or shared
  Tool/Phase outcome contract.

### R8: Global Extension lifetime

- `RuntimeBootstrap.loadExtensions` is the only Extension load interface.
- Activate Extensions in deterministic registration order before readiness and
  make successful Extension contributions implicit in every Resource View.
- Attribute hooks/providers/Tools/Phases to the activating Extension. On parse or
  activation failure, roll back its contributions and disposer, record a
  diagnostic, and continue other Extensions.
- Freeze successful Extensions until Runtime close; dispose them in reverse
  activation order and continue after cleanup diagnostics.
- Reject Definition, Definition Layer, or Phase `extensions` selection.

### R9: Concurrency and locality

- One Registry commit lock owns source replacement and snapshot publication;
  expensive filesystem parsing happens outside the lock and is revalidated at
  commit.
- A snapshot sees either complete prior source revisions or complete new
  revisions, never a mixture.
- Keep Registry Source Transaction, Configuration Snapshot Resolver, Runtime
  Extension Lifetime, Tool binding, and Phase binding as private modules behind
  the public interfaces above.

## Non-goals

- A host Scope, Project, Task, Workflow, hierarchy, or routing model in Rowan
- A Workflow Resource Kind
- A public callback/general `ResourceSource` class
- Tool code dynamically imported from a configuration directory
- A shared durable Tool/Phase invocation entity
- A per-Agent/per-view Extension sandbox or activation switch
- Persisting source paths or host executable function bodies
- A runtime-wide Catalog query API
- Compatibility parsing for removed `extensions`

## Acceptance

- Public-interface tests lock the exact Registry, bootstrap, Resource View,
  Definition Layer, and Agent Configuration seams.
- Source tests prove normalization, same-source replacement/unload, structured
  invalid-item diagnostics, atomic rollback, source revisions, core collisions,
  and cross-source same-name coexistence.
- View tests prove separate views resolve same-name resources, one colliding view
  fails, unknown sources fail, and unrelated sources remain irrelevant.
- Definition tests prove omitted/empty/named monotonic narrowing, Layer body/model
  behavior, Context independence, missing-name diagnostics, and removed
  Extension selectors.
- Snapshot tests prove coherent concurrent rereads, active/input-waiting pinning,
  no stale fallback, and exact source-qualified restart rebinding.
- Tool tests prove registered dispatch through the existing durable Tool Call
  lifecycle with generic metadata and no automatic retry.
- Phase tests prove registered dispatch through existing routing/checkpoint/input
  behavior without a Tool-like durable invocation.
- Lifecycle tests prove queued recovery cannot run before bootstrap, late
  Extension operations are impossible/rejected, failed activation rolls back,
  and close disposes in reverse order.
- Package tests, typecheck, build, public-interface check, and diff check pass.
