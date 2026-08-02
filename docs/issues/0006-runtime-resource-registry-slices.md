# Runtime Resource Registry issue slices

Status: Approved local execution plan. No GitHub Issues have been created.

Source: [PRD-0006](../prd/0006-runtime-resource-registry.md)

Decision: [ADR-0007](../adr/0007-runtime-resource-registry.md)

Each slice follows one red → green cycle through a public Rowan seam. Do not
start host migration until the prerequisite Rowan slices have landed.

## Slice 1: Define Registry types and name/collision semantics

At the exported Runtime contracts seam, introduce `ResourceKind`, `LoadInput`,
`LoadResult`, resource refs/diagnostics, shared resource-name validation, and
the Tool/Phase contribution types. Reserve core Tool names and `default`.

Acceptance:

- Public tests prove name grammar, sourceId requirements, cross-kind coexistence,
  same-kind hard duplicates, no-commit rollback, and structured results.
- No host Scope or generic public ResourceSource type enters the public surface.

## Slice 2: Register Agent, Skill, and Phase sources

At the Runtime Resource Registry seam, implement explicit `loadAgents`,
`loadSkills`, and `loadPhases` with directory + values normalization,
same-source replacement, unload, invalid-item diagnostics, and missing-root
handling.

Acceptance:

- Tests prove one source can combine a directory and values, replacement removes
  stale entries, and invalid individual files do not hide valid siblings.
- A duplicate in any merged input rejects the entire call and retains the prior
  source contribution set.

## Slice 3: Register and dispatch Tools and executable Phases

At the durable Tool/Phase invocation seam, add `loadTools`, the shared
InvocationContext/Outcome contracts, schema validation, default-no-retry, and
explicit retry behavior.

Acceptance:

- Tool/Phase handler tests prove Rowan creates invocation identity, calls host
  code once by default, validates I/O, handles input-required outcomes, and
  persists results through existing lifecycle state.
- Tool registration accepts values only; no Tool directory importer exists.

## Slice 4: Resolve registered Definitions into per-Run snapshots

At the Agent creation/configuration and ConfigProvider seams, replace direct
candidate-resource bags with registered Definition references plus runtime
options and Context Candidates. Re-read non-Extension directories before each
new Run and persist one coherent resolved snapshot.

Acceptance:

- Tests prove Agent/Workflow/Phase selection narrowing, omitted/empty/named
  behavior, Context selection, and missing-name warnings.
- Tests prove active/input-waiting snapshots remain pinned, new Runs see valid
  file changes, duplicate rereads fail the new Run, and restart uses current
  same-name host handlers.

## Slice 5: Make Extensions Runtime-global

At Runtime startup and Extension API seams, activate Extensions before the
first Agent/Run, remove Definition-level Extension selection, expose scoped
`api.loadTools` / `api.loadPhases`, and implement activation rollback and
reverse-order disposal.

Acceptance:

- Tests prove late Extension load/unload rejection, one failure skips only that
  Extension after rolling back its contributions, and all successful Extensions
  remain active until Runtime close.
- Parser/public tests prove `extensions` no longer belongs to Agent, Workflow,
  or Phase definition vocabulary.

## Slice 6: Remove superseded candidate assembly and verify the public seam

Delete per-Agent Extension assembly and obsolete candidate-resolution paths,
update package documentation/examples, and verify public exports.

Acceptance:

- Searches show no AgentConfig Extension candidate list or Definition Extension
  selector remains.
- Focused tests, full package tests, typecheck, build, public-interface check,
  and diff check pass.
