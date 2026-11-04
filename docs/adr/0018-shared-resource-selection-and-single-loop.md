---
status: accepted
date: 2026-11-04
---

# Shared Resource Selection and Single Loop

Resource selection grew through separate allowlist, Definition Layer
intersection, Core-resource partition, assembly, and Phase-local filtering
implementations. They disagree about empty lists, Core resources, replacement
values, and the point at which narrowing stops. ADR-0013 and ADR-0016 added two
more special cases by making Core Tools, Core Phases, and same-name replacements
unconditionally selected.

Hosts need one capability policy across every selectable resource kind. They
also need an Agent that can operate without Phases at all: a conversation-only
Agent should not receive route machinery, a Stop Phase, or compaction it cannot
use.

## Decision

### One Resource Selection rule

Every selectable Resource kind uses one Resource Selection module. It owns
selection entry normalization, positive and negative names, Core retention,
Definition Layer narrowing, Phase narrowing, and diagnostics.

The existing `tools`, `skills`, `phases.phaseIds`, and `contexts` fields remain
the public configuration. Their entries are interpreted as follows:

- An omitted list selects its whole universe: every candidate at base selection,
  or the surviving parent set in a Definition Layer or Phase.
- `[]` selects Core candidates and no non-Core candidate.
- A non-empty list containing only `-name` entries starts with that same
  universe and removes the named values.
- A list with positive names retains every Core candidate and selects the named
  non-Core candidates.
- `-name` removes a named value from either side.
- Exclusion wins over inclusion and list order has no effect.
- `+name` and `!name` are invalid.
- A missing name warns and is skipped or ignored; it never widens the set.

The module is used for Tools, Skills, Phases, and Contexts. Agent Definition
references are singular and Resource View entries select Source IDs, so neither
uses this list syntax. Concrete values such as `bundledSkills`, Phase Bundle
Skills, and additional Contexts are not Resource selectors.

### Core is selected by default, not unconditionally

A resource with `core: true` or a Rowan built-in name is a Core Resource. A
matching `-name` may remove it for one Agent. No Definition, Definition Layer,
Phase filter, assembly step, or runtime normalization may add it back.

Same-name replacement still takes precedence over the built-in value. Removal
then applies to the winning value, so removing a replaced Tool never falls back
to Rowan's built-in implementation.

Definition Layer and Phase selection are monotonic. Their candidate pool is the
surviving parent set. They may remove values or select among remaining non-Core
values, but cannot restore a value removed earlier.

### Phase count, entry resolution, and Single Loop

Let `S` be the selected Phases and `R` the members of `S` whose
`disableAutoInvocation` is not `true`. Rowan's built-ins are `default` and
`stop` in `R`, and `compact` outside it.

The reserved `route` Tool is synthesized exactly when `|R| >= 2`. Its catalog
contains `R`, and its contents and schema do not change. With `|R| <= 1`, no
`route` Tool is exposed. The default configuration keeps `R = {default, stop}`,
so its route behaviour is unchanged.

Entry resolution order is:

1. an explicit, surviving `entryPhaseId`;
2. a surviving `default`;
3. the sole member of `R` when `|R| = 1`;
4. no Phase entry.

A missing explicit entry keeps its warning and continues down this order. When
no entry resolves, the Run starts in a Phase-less entry Loop. This Loop injects
no Phase prompt, Phase Tool or Skill filter, Phase instruction message, Phase
entry method, or Phase hook. It keeps the Agent System Prompt, selected Tools,
Skills, Contexts, Tool hooks, Run Interactions, suspension and resume,
cancellation, Execution Checkpoints, restart recovery, and the normal loop
limit.

The Phase-less entry Loop with `|R| >= 2` starts with `route` and may route into
a selected Phase. `previous`, `continue`, and `stop` keep their existing
semantics; `previous` from the first routed Phase ends because the hidden entry
is not a previous Phase. With `|R| <= 1`, the Phase-less entry Loop has no
`route` and is a Single Loop.

When `route` is absent and an entry Phase exists, that Phase hosts the Single
Loop and contributes its prompt, Tools, and Skills. A sole auto-invocable
`stop` is treated literally. A selection with no auto-invocable Phase,
including one that leaves only `compact`, uses the Phase-less entry Loop.

The run still uses the existing Phase execution state. The Phase-less entry
Loop is represented by one hidden internal entry item that is excluded from
`R`, the route catalog, invocation listings, and user-selected Phases. Rowan
does not add a Phase stack or a new checkpoint shape.

Single Loop:

- exposes no `route` Tool and performs no Phase routing or transition;
- runs the existing internal model-to-Tool loop until a response has no ordinary
  Tool calls;
- commits that final response as the Run Outcome;
- preserves Tool hooks, Run Interactions, suspension and resume, cancellation,
  Execution Checkpoint, restart recovery, and the existing loop limit.

Compaction follows `compact` selection, not Loop shape. While `compact` remains
selected, automatic pre-Run compaction, context-overflow recovery, and explicit
Control Phase Runs keep their existing behaviour. Removing `compact` disables
automatic and overflow compaction; an explicit Control Run then uses the existing
missing-Phase failure path.

When `route` remains, `route(stop)` is terminal even without a Stop Phase.
Absent Phases stay absent. A Control Phase Run for any absent Phase uses the
existing missing-Phase failure path.

### Ownership

Configuration Snapshot resolution owns Definition and Definition Layer
selection. Runtime assembly consumes the selected Host and Extension values and
only materializes selected Rowan-generated Core Tools. Phase execution uses the
same module to narrow `Phase.tools`. Runtime Phase normalization validates the
selected registry and entry; it does not inject removed Core Phases.

The Resource Registry still owns registration-time duplicate and name
validation. Skill replacement merging, selected-reference filtering, and route
Tool synthesis remain adjacent behaviours rather than duplicate selectors.

## Consequences

- ADR-0013 and ADR-0016 are amended: Core values are selected by default and
  removable by explicit `-name`, not always selected.
- ADR-0007's list semantics are implemented by one Resource Selection module
  across all selectable kinds.
- A host can deploy a conversation-only Agent with no Phase machinery, or a
  one-Phase Agent that runs without route.
- Removing the entry Phase can start a Phase-less entry Loop; if two or more
  auto-invocable Phases remain, it can route into them without first entering
  one of them.
- Compaction remains available whenever `compact` survives, regardless of
  whether the Run uses the Phase machine or Single Loop.
- The implementation has one selection policy to extend when a new Resource kind
  gains a selector.

## Rejected options

- A separate `excludeTools` or per-kind deletion setting: it would duplicate the
  existing selection list and make Layer precedence ambiguous.
- `+name` as a second positive syntax: unprefixed positive names already select,
  while negative-only lists modify the inherited set.
- Runtime fallback to another Phase when none can be entered: it hides a host
  configuration outcome and makes execution nondeterministic.
- A new Phase stack, checkpoint shape, or exposed entry Phase for Phase-less
  routing: the existing hidden internal entry item and Phase execution state
  already cover it.
- Keeping Core injection in assembly or Phase normalization: it would bypass
  capability removal and recreate the fragmented policy.
