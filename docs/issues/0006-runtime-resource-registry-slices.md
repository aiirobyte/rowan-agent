# Scoped Runtime Resource Registry issue slices

Status: Partially implemented locally; Slice 7's removal is not done. Do not
publish to GitHub without a separate request.

Source: [PRD-0006](../prd/0006-runtime-resource-registry.md)

Decision: [ADR-0007](../adr/0007-runtime-resource-registry.md)

Each slice follows one red → green cycle through a public Rowan seam. Host
migration may consume a slice only after all prerequisites named below land.

## Progress (recorded after the fact, 2026-09-24)

Seam-level audit: Slices 1-6 landed — `runtime/resource-registry.ts` (contracts
and atomic Source Transactions), `runtime/extension-lifetime.ts` (bootstrap and
global Extension gating), the declarative Agent/Skill/Phase and Tool/Phase
registration paths, `runtime/configuration-snapshot.ts` (Resource Views into
snapshots), and the runtime's bootstrap-before-scheduler ordering with the
execution identity carried on Tool and Phase contexts.
Tests: `test/runtime/{resource-registry,core-resources,tool-lifecycle,phase-normalization,configuration-snapshot,extension-lifetime,runtime-bootstrap}.test.ts`,
`test/harness/resource-loading.test.ts`.

Not landed: Slice 7, the removal it names. What it takes, measured on this tree:
four production files (`runtime/contracts.ts`'s `AgentResources` and the
`resources` field, `runtime/configuration-snapshot.ts`, the two
`assembleRegisteredExtensions` call sites in `runtime/durable-runtime.ts`, and
`cli/src/cli.ts`) plus eleven test files, each of which builds its own
`AgentConfig` with a local helper, so their resources have to arrive through the
registry rather than a rewrite. It is also a host contract change, not only a
deletion: `isAgentConfiguration(config)` is `!("resources" in config)`, so removing
the field collapses the concrete config and the resolved snapshot into one shape —
and Mori builds concrete configs today (`packages/core/src/runtime/config-provider.ts`,
`loadMergedAgentConfig`), so the upstream removal and the Mori migration belong to
one piece of work with both suites as its gate. Of the acceptance's four
searches, two already hold: "shared Tool/Phase Invocation Outcome" has no hits, and
a Definition/Phase `extensions` field is rejected at parse time rather than
supported.

The expand half of the removal is in the tree, so the rest can land file by file:
`packages/agent/test/fixtures/configuration.ts` registers a test's resources the
way a Host does (`runtime.loadAgents/loadSkills/loadPhases/loadTools`) and returns
the view that reads them, and `phase-payload.test.ts` is migrated onto it as the
worked example — nine tests green on the registry path, including the two moves
the migration has to know about: the entry Phase selection belongs to the
Definition (`definition.phases`), and a view that needs the route Tool or the core
Phases lists `rowan.core`. What remains: the other eleven test files, the CLI, then
the source collapse itself (`contracts.ts`'s `AgentResources`/`AgentConfig`/
`AgentConfigRequest`/`isAgentConfiguration`/`assertAgentConfig`,
`configuration-snapshot.ts`'s `materializeConfigurationSnapshot`, the assembly's
`config.resources` reads, `config-commands.ts`, the index exports), the hook
fallback in `durable-runtime.ts` that no Host supplies, docs/examples, and the
public-interface baseline. Then Mori, whose config provider builds concrete
configs. `AgentConfig.resources` /
`AgentResources` are still exported and accepted, the per-Agent assembly
(`runtime/extensions.ts:assembleRegisteredExtensions`) is still called from
`durable-runtime.ts`, `loadSkills`/`loadPhases` are still public, and the README
and `docs/phases.md` still document the concrete `resources` shape. Slice 5
landed additively, so this is the piece that would make the registry the only
authority.

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
