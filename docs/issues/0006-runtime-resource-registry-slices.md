# Scoped Runtime Resource Registry issue slices

Status: Approved local execution plan. No GitHub Issues have been created.

Source: [PRD-0006](../prd/0006-runtime-resource-registry.md)

Decision: [ADR-0007](../adr/0007-runtime-resource-registry.md)

Each slice follows one red → green cycle through a public Rowan seam. Host
migration may consume a slice only after all prerequisites named below land.

## Dependency graph

```text
1 Source transactions ─┬─> 2 Declarative loaders ─┐
                       ├─> 3 Tool binding ─────────┤
                       └─> 4 Phase binding ────────┤
2 + 3 + 4 ───────────────> 5 View/Snapshot resolver
1 + 3 + 4 + 5 ───────────> 6 Readiness/Extensions
1–6 ─────────────────────> 7 Removal/verification
```

## Slice 1: Registry contracts and atomic Source Transactions

At the exported Registry seam, introduce `ResourceKind`, `ResourceSourceId`,
typed `LoadInput`, `LoadResult`, refs/diagnostics, shared name validation, and
one private Registry Source Transaction module.

Acceptance:

- Public tests prove Source ID/name grammar and no generic public
  `ResourceSource` or host Scope type.
- Tests prove directory + values normalization, same-source replacement,
  unload, stale-entry removal, opaque revisions, and no-commit rollback.
- Same-source duplicates and implicit core collisions fail; same-kind same-name
  values in distinct ordinary sources may coexist.
- Missing/unreadable roots and malformed individual files return structured
  diagnostics without hiding valid siblings.

## Slice 2: Register declarative Agent, Skill, and Phase sources

Implement `loadAgents`, `loadSkills`, and file/inline Phase normalization on top
of Slice 1 without changing Agent configuration yet.

Depends on: Rowan 1.

Acceptance:

- Public tests prove typed loaders combine supported directory and inline values
  into one source revision.
- Agent, Skill, and Phase parsing uses the existing validators and removes
  `extensions` from Definition/Phase vocabulary.
- Phase file declarations are source-qualified; optional executable handlers
  are left for Slice 4.

## Slice 3: Register Tools through the durable Tool Call lifecycle

Add values-only `loadTools`, source-qualified Tool handler bindings, and generic
Agent/Run Metadata on `ToolInvocationContext`. Dispatch registered Tools through
the existing durable Tool Call state machine.

Depends on: Rowan 1.

Acceptance:

- Tests prove exact `(tool, sourceId, name)` binding, parameter validation,
  progress, cancellation, durable result commit, and indeterminate-effect rules.
- Restart tests prove a handler from another source with the same name is never
  substituted.
- No Tool directory importer, automatic retry policy, output-schema entity, host
  Scope, or shared Tool/Phase Invocation Outcome enters the public surface.

## Slice 4: Register Phases through the existing Phase lifecycle

Add source-qualified inline/file Phase handler bindings and generic Agent/Run
Metadata on `PhaseExecutionIdentity`. Dispatch them through existing Phase
Context, routing, input, and checkpoint behavior.

Depends on: Rowan 1 and Rowan 2.

Acceptance:

- Tests prove declarative-only and executable Phases, exact source binding,
  routing, payload, model invocation, input suspension/resume, and checkpoint
  recovery.
- No durable Phase Call, Tool-style retry, Tool Call state reuse, or shared
  invocation outcome is introduced.

## Slice 5: Resolve Resource Views into Configuration Snapshots

Replace concrete candidate bags in create/update configuration with registered
Definition references, required Resource Views, optional Definition Layers,
Context Candidates, and runtime options. Add the private Configuration Snapshot
Resolver.

Depends on: Rowan 1–4.

Acceptance:

- Public tests lock `ResourceView`, `DefinitionLayer`, and
  Definition-reference `AgentConfiguration` shapes.
- Separate views successfully resolve same-name resources; a duplicate in one
  view and an unknown source fail without stale fallback.
- Tests prove Definition → Layer → Phase monotonic narrowing,
  omitted/empty/named behavior, Layer body/model replacement, Context selection,
  and missing-name diagnostics.
- New Runs atomically reread visible sources; active/input-waiting snapshots stay
  pinned and persist source revisions plus `(kind, sourceId, name)` refs.
- Restart recovery uses only exact current source-qualified handlers.

## Slice 6: Gate scheduling on Runtime readiness and global Extensions

Change `AgentRuntime.init` to run an unexposed bootstrap Registry before
starting the Scheduler or recovering queued Runs. Move Extension loading to
that bootstrap-only interface and implement the private Runtime Extension
Lifetime module.

Depends on: Rowan 1, Rowan 3, Rowan 4, and Rowan 5.

Acceptance:

- Tests prove queued Runs cannot execute and Agents cannot be created before
  bootstrap source/handler registration and Extension activation finish.
- A thrown bootstrap rolls back Extensions, releases ownership, and returns no
  Runtime.
- Extension contributions are implicit in every view; activation failure rolls
  back only that Extension and successful Extensions freeze until reverse-order
  disposal.
- The ready Runtime exposes non-Extension reload/unload but no usable late
  Extension load/unload seam.

## Slice 7: Remove superseded candidate assembly and verify

Delete per-Agent Extension assembly, concrete candidate Config paths, stale
directory fallback, obsolete loaders/tests, and old public exports. Update
package docs/examples.

Depends on: Rowan 1–6.

Acceptance:

- Searches show no `AgentConfig.resources`, Definition/Phase `extensions`,
  Runtime-global ordinary resource collision rule, or shared Tool/Phase
  Invocation Outcome remains.
- Focused tests, full package tests, typecheck, build, public-interface check,
  and diff check pass.
