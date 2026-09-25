# Scoped Runtime Resource Registry issue slices

Status: Implemented locally through Slice 7. Do not publish to GitHub without a
separate request.

Source: [PRD-0006](../prd/0006-runtime-resource-registry.md)

Decision: [ADR-0007](../adr/0007-runtime-resource-registry.md)

Each slice follows one red → green cycle through a public Rowan seam. Host
migration may consume a slice only after all prerequisites named below land.

## Progress: Slice 7 landed (recorded after the fact, 2026-09-25)

The removal is in the tree. What landed, in the order it landed:

1. Tests first, so every step stayed green while both shapes were supported.
   Every test that creates an Agent registers its Definition, Tools, Skills and
   Phases through `runtime.loadAgents/loadSkills/loadPhases/loadTools` and reads
   them through a Resource View; `test/fixtures/configuration.ts` grew
   `seedResources`, `configuration`, `createAgentWith` and `createPhaseAgent`.
   Two expectations moved with the shape: duplicate Tool candidates are rejected
   at registration instead of as an execution failure, and a host Phase whose
   name an Extension also contributes is rejected while the view resolves
   (`configuration_unavailable`), because Extension contributions are implicit
   in every view and the registry owns collision semantics.
2. The collapse. `AgentConfig`, `AgentResources`, `AgentConfigRequest`,
   `isAgentConfiguration` and `assertAgentConfig` are gone; `AgentConfiguration`
   is the only request shape and `assertAgentConfiguration` the only validator.
   `materializeConfigurationSnapshot` is gone, replaced by
   `isConfigurationSnapshot`. The assembly reads a `ConfigurationSnapshot`
   directly, a `ConfigurationSnapshot` is held frozen in place rather than
   rebuilt from a request, and `resourceView` is part of every request.
3. Extension contributions have exactly one source. The assembly no longer
   appends the runner's own copy of an Extension Tool and no longer merges the
   runner's Phase registry: `RuntimeBootstrapRegistry.loadExtensions` already
   registers both under the implicit `rowan.extensions` source, which
   `withImplicit` adds to every view. That resolves the site this file recorded
   as having no equivalent: a Definition selecting an Extension Tool, and the
   Run that assembles Extension Tools and hooks, both now use the view.
4. `packages/cli/src/cli.ts` registers its workspace Definition, Skills and
   Phases under `rowan.cli` in `init({ bootstrap })` and passes a view; its
   Config Provider holds `AgentConfiguration | ConfigurationSnapshot`.
5. Docs: `packages/agent/README.md` and `packages/agent/docs/phases.md`
   document registration, Definition selection and the view instead of a
   concrete `resources` bag.
6. Public interface: 32 runtime values, 145 types (`AgentConfig`,
   `AgentConfigRequest` and `AgentResources` are gone; `isConfigurationSnapshot`
   replaces `materializeConfigurationSnapshot`).

Verified: `bun run build` (tsc), `bun test packages` (320 pass),
`bun test packages/cli` (38 pass), `bun run build:packages` (public interface),
`git diff --check`. The acceptance searches hold: no `AgentConfig.resources`
outside the dated design docs, no Definition/Phase `extensions` field, no
Runtime-global ordinary resource collision rule, no shared Tool/Phase Invocation
Outcome.

Still open, and deliberately not part of this slice: the host migration. Mori
builds concrete configs today (`packages/core/src/runtime/config-provider.ts`,
`loadMergedAgentConfig`), so it moves to `resourceView` sources before it can
adopt the release that carries this change.

## Progress (recorded after the fact, 2026-09-24)

Seam-level audit: Slices 1-6 landed — `runtime/resource-registry.ts` (contracts
and atomic Source Transactions), `runtime/extension-lifetime.ts` (bootstrap and
global Extension gating), the declarative Agent/Skill/Phase and Tool/Phase
registration paths, `runtime/configuration-snapshot.ts` (Resource Views into
snapshots), and the runtime's bootstrap-before-scheduler ordering with the
execution identity carried on Tool and Phase contexts.
Tests: `test/runtime/{resource-registry,core-resources,tool-lifecycle,phase-normalization,configuration-snapshot,extension-lifetime,runtime-bootstrap}.test.ts`,
`test/harness/resource-loading.test.ts`.

Not landed at that point: Slice 7, the removal it names. What it took, measured
on that tree:
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

A collapse attempt on 2026-09-24 mapped what the removal really touches, and was
reverted rather than left half-done. Findings worth keeping:

- The surface is bigger than the type checker shows. `AgentConfiguration` has no
  `resources`, but a plain object literal assigned to a variable is not
  excess-property-checked, so a test that passes `{ identity, definition,
  resources, model }` still compiles and fails only at run time. The real work
  list is "every test that creates an Agent", not "every file with a type error".
- Two seams must move together: the provider's snapshotter needs a branch per
  shape (a resolved snapshot must be frozen, not rebuilt from `definition.name` —
  rebuilding it drops `prompt`, and the resumed Execution Attempt then fails in
  the System Prompt assembly), and the registry reserves the core Phase and Tool
  names, so a test that registers its own `stop` or `default` Phase now fails at
  registration instead of at execution.
- One site has no equivalent in the view yet: a Definition that selects a Tool
  an Extension registered. The extension's Tool reaches the registry, so it can
  arrive through the view, while the assembly still appends the runner's copy —
  and the legacy collision rule then rejects the pair. Either the view owns the
  Extension's source or the assembly stops re-adding what the registry already
  holds; that choice belongs to the collapse, not to a test.
- What worked, and is the template for the rest: register the Definition and the
  resources through `runtime.loadAgents/loadSkills/loadPhases/loadTools`, list
  those sources in the view, put the Phase selection on the Definition
  (`phases: { entryPhaseId, phaseIds }`), and list `rowan.core` when the Agent
  needs the route Tool or the core Phases.

The expand half of the removal is in the tree, so the rest can land file by file:
`packages/agent/test/fixtures/configuration.ts` registers a test's resources the
way a Host does (`runtime.loadAgents/loadSkills/loadPhases/loadTools`) and returns
the view that reads them, and `phase-payload.test.ts` is migrated onto it as the
worked example — nine tests green on the registry path, including the two moves
the migration has to know about: the entry Phase selection belongs to the
Definition (`definition.phases`), and a view that needs the route Tool or the core
Phases lists `rowan.core`. What remained at that point: the other eleven test files, the CLI, then
the source collapse itself (`contracts.ts`'s `AgentResources`/`AgentConfig`/
`AgentConfigRequest`/`isAgentConfiguration`/`assertAgentConfig`,
`configuration-snapshot.ts`'s `materializeConfigurationSnapshot`, the assembly's
`config.resources` reads, `config-commands.ts`, the index exports), the hook
fallback in `durable-runtime.ts` that no Host supplies, docs/examples, and the
public-interface baseline. Then Mori, whose config provider built concrete
configs. At that point `AgentConfig.resources` /
`AgentResources` were still exported and accepted, the per-Agent assembly
(`runtime/extensions.ts:assembleRegisteredExtensions`) was still called from
`durable-runtime.ts`, `loadSkills`/`loadPhases` were still public, and the README
and `docs/phases.md` still documented the concrete `resources` shape. Slice 5
landed additively, so this was the piece that would make the registry the only
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
