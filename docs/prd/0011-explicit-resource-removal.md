# PRD: Explicit Resource Removal

Status: ready-for-agent

## Problem Statement

Resource selection is fragmented across several allowlist, intersection, and Core-resource special cases. A host cannot remove a Core Tool or a Core Phase from one Agent, and equivalent selection rules are implemented separately for Tools, Skills, Phases, and Contexts. Same-name replacements inherit the same unconditional Core behaviour, so a host cannot switch off a capability after replacing its implementation.

The host can reject Tool calls in `before_tool_call`, but that is too late. The unavailable capability is still advertised to the model, still contributes prompt guidance, and may still be exposed through the Provider Tool context. Core Phases have the same problem at the execution layer: they are re-injected after selection, so a host cannot make a capability absent.

## Solution

Add one negative-entry syntax to every Rowan resource selection list: `-name` explicitly removes the named resource.

All resource kinds use one Resource Selection module. It owns entry normalization, positive and negative semantics, Core retention, monotonic parent narrowing, Phase narrowing, and diagnostics. Definition, Definition Layer, Phase, assembly, and runtime paths call it instead of implementing their own list filtering or Core partition.

Core resources are selected by default. An omitted list, an explicitly empty list, and a positive-only list retain every Core resource. Only a matching `-name` removes one. A non-empty list containing only negative entries modifies the inherited default selection. This rule is uniform across Tool, Skill, Phase, and Context selections.

Removal happens after same-name replacement. `-edit` therefore removes the winning `edit` implementation and never falls back to Rowan's built-in implementation. Removed resources are absent from the Configuration Snapshot's effective capability set, model-facing and execution surfaces, and any later narrowing layer.

Phase selection controls whether Rowan runs the Phase machine, a Phase-hosted Single Loop, or a Phase-less entry Loop. Let `S` be the selected Phases and `R` the auto-invocable members of `S` (`disableAutoInvocation !== true`). `route` is present exactly when `|R| >= 2`, with the existing `createRouteTool(R)` catalog and schema. Entry resolution is explicit `entryPhaseId`, then a selected `default`, then the sole member of `R` when `|R| = 1`, then a Phase-less entry Loop. The Phase-less entry Loop injects no Phase prompt, Phase Tool/Skill filtering, or Phase instruction message, but keeps the Agent System Prompt, selected Tools/Skills/Contexts, Tool hooks, Run Interactions, checkpoints, restart recovery, cancellation, and loop limit.

Compaction is not tied to the Loop shape. While `compact` remains selected, automatic pre-Run compaction, context-overflow recovery, and explicit Control Phase Runs keep their existing behaviour. Removing `compact` is the only selection change that disables compaction.

No new configuration field, CLI flag, or public selector type is introduced.

## User Stories

1. As a host, I want one syntax for explicit removal, so that every resource type does not need a different opt-out mechanism.
2. As a host, I want an omitted selection list to keep the current behaviour, so that existing Agents require no migration.
3. As a host, I want an explicitly empty list to retain Core resources and select no non-Core resource, so that existing empty lists keep their current meaning.
4. As a host, I want an unprefixed name to select that non-Core resource while retaining every Core resource, so that adding one optional resource does not silently remove a capability.
5. As a host, I want `-bash` to remove only `bash`, so that an Agent can keep read and edit capability without command execution.
6. As a host, I want to remove any subset of the Rowan Core Tools by name, so that each Agent receives only the Tool capability it needs.
7. As a host, I want to remove all four Rowan Core Tools by naming all four exclusions, so that a conversation-only Agent has no file or command capability.
8. As a host, I want to combine positive and negative entries, so that one list can select an optional resource and remove a Core resource at the same time.
9. As a host, I want a same-name Core replacement to obey the same removal rule, so that a sandbox or document-backed implementation cannot survive a capability shutdown.
10. As a host, I want a removed name to have no built-in fallback, so that `-edit` cannot accidentally restore Rowan's host-filesystem edit implementation.
11. As a host, I want removed Tools absent from the model's Tool definitions, so that the model is not invited to call them.
12. As a host, I want removed Tools absent from `ProviderCallContext.tools.list()`, so that an ACP or MCP bridge does not re-advertise them to another agent.
13. As a host, I want the prompt snippets and guidelines of removed Tools absent from the System Prompt, so that the prompt does not describe unavailable capability.
14. As a host, I want a call to a removed Tool to follow the unknown-Tool path, so that it never executes and returns an actionable error instead.
15. As a host, I want to remove a Skill from the Definition or Definition Layer, so that its guidance is not selected into the Agent Context.
16. As a host, I want to remove a Context Candidate from the Definition, so that host data is not rendered into the System Prompt.
17. As a host, I want to remove an authored Phase, so that it is absent from routing, invocation, and direct Phase execution.
18. As a host, I want to remove a Core Phase, so that capability policy applies to Phases as well as Tools.
19. As a host, I want a Definition Layer to remove inherited resources but never add back a resource removed by the parent, so that capability reduction remains monotonic.
20. As a host, I want a Phase to narrow the Agent's resources further with the same syntax, so that each Phase can apply least privilege without a second filtering model.
21. As a host, I want a Phase's positive names to resolve only against the remaining resources, so that a Phase cannot restore a capability the Agent removed.
22. As a host, I want exactly one auto-invocable Phase to host a Single Loop, so that one capability can run without routing machinery.
23. As a host, I want a route-capable Phase selection without an entry to start a Phase-less entry Loop, so that the model can route into a selected Phase without receiving Phase configuration first.
24. As a host, I want a no-entry selection with fewer than two auto-invocable Phases to run the Phase-less Single Loop, so that a conversation-only Agent needs no Phase machinery.
25. As a host, I want a removed `stop` Phase to leave `route(stop)` as a terminal control when `route` remains, so that normal completion does not depend on an optional synthesis pass.
26. As a host, I want a removed `compact` Phase to disable compaction instead of blocking the original Run, so that the reduced Agent degrades predictably when the context grows.
27. As a host, I want a Control Phase Run for a removed Phase to use the existing missing-Phase failure path, so that Rowan does not invent a fallback execution path.
28. As a host, I want `route` to remain reserved execution machinery, so that routing is not coupled to business resource selection.
29. As a host, I want the effective selection frozen in the Configuration Snapshot, so that an Agent Configuration update cannot change an active or input-waiting Run.
30. As a host, I want a ConfigProvider to rebuild the same effective resources after a process restart, so that capability reduction is durable rather than process-local.
31. As a host, I want every retained Tool to continue through `before_tool_call`, so that permission policy still applies to the capabilities that remain.
32. As a user of Mori or the Rowan CLI, I want existing omission, empty-list, and positive-list configurations to behave exactly as before, so that the change does not require host migration.
33. As a host, I want missing or malformed selection entries diagnosed consistently, so that a typo does not silently leave a sensitive resource enabled.
34. As a maintainer, I want one deep selection module, so that a future resource kind does not require another copy of allowlist, Core, Layer, and Phase rules.

## Implementation Decisions

### One Resource Selection module

Create one Resource Selection module for every selectable Resource kind. It accepts:

- the resource kind used in diagnostics;
- the visible Resource Candidates, or the already-selected parent set;
- the optional selection list;
- the Core predicate for that kind;
- whether the call is base selection, Definition Layer narrowing, or Phase narrowing.

It returns the selected resources and diagnostics. It is the only place that interprets entry prefixes, normalizes entries, partitions Core resources, intersects with a parent, or emits missing-resource warnings.

The existing public configuration remains a string list. The module may use an internal normalized representation, but no new host-facing field or selector type is added.

### Generic selection rule

Let:

- `C` be the Core resources in the candidate or parent set.
- `O` be the non-Core resources in the candidate or parent set.
- `P` be the positive names.
- `X` be the names in negative entries.

| Selection list | Selected resources |
| --- | --- |
| omitted | `C ∪ O` |
| `[]` | `C` |
| `[-name]` | `(C ∪ O) \ {name}` |
| `[name]` | `C ∪ ({name} ∩ O)` |
| `[name, -other]` | `(C ∪ ({name} ∩ O)) \ {other}` |

For a Layer or Phase, `C` and `O` are the surviving parent sets, not the original candidate universe. Therefore a later list can only remove from its parent or select within its parent's non-Core values.

The reserved `route` Tool is not part of any candidate set. It is execution machinery and remains governed by existing routing rules.

### Entry normalization and conflicts

- Entries are trimmed and exact duplicates have no additional effect.
- An unprefixed entry is a positive exact name.
- `-name` is a negative exact name.
- Exclusion wins over inclusion, independent of list order.
- A bare `-` is invalid.
- `+name` and `!name` are not supported and are rejected rather than treated as names.
- A missing positive name warns and is skipped.
- A missing negative name warns and has no effect; it never widens the set.
- Name matching is exact. Globs, patterns, and ordering precedence are not introduced.

### Resource-type coverage

The same module applies to every existing selection list. Differences are limited to where a list exists, which Core instances exist, and how its selected values are consumed.

| Resource kind | Selection lists | Core instances today | Difference from the generic rule |
| --- | --- | --- | --- |
| Tools | Definition `tools`, Definition Layer `tools`, Phase `tools` | `read`, `edit`, `write`, `bash`; host and Extension `core: true` Tools | Phase Tool selection can only narrow the Agent's effective Tool Capability set. `route` is excluded from selection. |
| Phases | Definition `phases.phaseIds`, Definition Layer `phases.phaseIds` | `default`, `stop`, `compact`; host and Extension `core: true` Phases | `entryPhaseId` is a singular reference, not a list. Final entry validation uses the selected Phase set. Phase resources do not select other Phases. |
| Skills | Definition `skills`, Definition Layer `skills` | None today; the generic module accepts a future Core Skill | Phase Bundle `skills` are concrete values, not a selector. They merge after Skill selection with the existing same-name replacement rule. `bundledSkills` and `additionalContexts` are also concrete values. |
| Contexts | Definition `contexts` only | None | Definition Layer cannot select Context Candidates under ADR-0007, so there is no layer list. Turn-scoped additional Contexts are not selectors. |
| Agent Definitions | Singular Definition name reference | None | No list, so `-name` does not apply. |
| Resource View | Source ID lists | Not resource-name candidates | Source visibility remains separate; negative Source ID syntax is not introduced. |
| Extensions | No Definition selection | Not applicable | Extension activation remains bootstrap-wide under ADR-0007. |

Phase `prompt-guidelines`, Tool parameters, Skill content, Context values, and other payload lists are not resource selectors and do not gain `-name` syntax.

### Definition Layer and Phase narrowing

Definition Layer and Phase selection use the same module in parent-aware mode:

- Omitted: inherit the parent selection.
- `[]`: retain the parent's surviving Core resources and select no non-Core resources.
- A non-empty list containing only negative entries: inherit the parent selection and remove the named resources.
- A list with positive entries: retain the parent's surviving Core resources, remove negative names, and select only positive names that are already selected non-Core values in the parent.
- A later layer cannot restore a resource removed by an earlier layer or by the Agent.

Definition Layer service order remains Definition first, then Layer. Phase Tool narrowing runs after Definition and Layer resolution. Skills still run the concrete `bundledSkills` and Phase Bundle merge after selection; that merge is value replacement, not another selector.

### Core Phase removal and Single Loop

Core Phases are selected through the same module. No runtime path may unconditionally add `default`, `stop`, or `compact` back after selection.

- A removed Core Phase is absent from `PhaseRegistry`, the automatic route catalog, `listInvocations`, and direct Phase execution.
- A same-name host or Extension Phase replacement is still Core and is removed by the same name.
- Existing active and input-waiting Runs keep their pinned Configuration Snapshot and are unaffected by a later Agent Configuration update.

Auto-invocable Phase count and entry resolution:

- Let `S` be the selected Phases and `R` the members of `S` with `disableAutoInvocation !== true`.
- Rowan's built-ins are `default` and `stop` with `disableAutoInvocation: false`, and `compact` with `true`.
- `route` is present exactly when `|R| >= 2`. Its catalog is `R` and its schema is unchanged.
- Entry resolution order is: an explicit, surviving `entryPhaseId`; a surviving `default`; the sole member of `R` when `|R| = 1`; otherwise a Phase-less entry Loop.
- A missing explicit entry keeps its existing warning and continues down the entry order. Rowan does not synthesize a replacement `default` and does not fail configuration resolution for a missing entry.
- A sole `stop` is used literally as the entry and hosts a Single Loop. A selection with no auto-invocable Phase, including one that leaves only `compact`, uses the Phase-less entry Loop.

Phase-hosted Single Loop:

- It runs the selected Phase with that Phase's prompt, narrowed Tools, and Skills.
- It exposes no `route` and performs no Phase transition.
- It ends when a model response contains no ordinary Tool calls. That response is the Run Outcome.
- Tool calls, `before_tool_call`, `after_tool_call`, Run Interactions, suspension and resume, cancellation, Execution Checkpoint, restart recovery, and the existing autonomous loop limit continue to work.
- It reuses Rowan's existing internal model and Tool loop. A second execution loop is not introduced.

When `route` is absent but an entry Phase exists, that entry Phase hosts the
Single Loop under the same rules.

Phase-less entry Loop:

- It is the same model-to-Tool loop using the Agent's conversation, System Prompt, Tools, Skills, and Contexts.
- It injects no Phase prompt, Phase Tools/Skills filter, Phase instruction message, Phase entry method, or Phase hook.
- With `|R| >= 2`, it starts with `route`; the model can route into selected Phases. `previous`, `continue`, and `stop` follow existing routing semantics; `previous` with no earlier Phase ends the Run.
- With `|R| <= 1`, it has no `route` Tool and is a Single Loop.
- It uses one hidden internal entry item, excluded from `R`, the route catalog, invocation listings, and user-selected Phases. Checkpoint, retirement, and restart reuse the existing Phase execution state; no new state shape is introduced.

The following table is normative; `R` is the Phase-level surviving auto-invocable set.

| Selection | R | `route` | Entry and Loop | Compaction |
| --- | --- | --- | --- | --- |
| no `-name` (`default`, `stop`, `compact`) | `default`, `stop` | yes | `default` | yes |
| `-compact` | `default`, `stop` | yes | `default` | no |
| `-stop` | `default` | no | Single Loop on `default` | yes |
| `-stop -compact` | `default` | no | Single Loop on `default` | no |
| `-default` (stop and compact remain) | `stop` | no | Single Loop on `stop` | yes |
| `-default` plus custom `A` (stop and compact remain) | `stop`, `A` | yes | Phase-less entry Loop; `entryPhaseId=A` enters `A` | yes |
| `-default -stop` plus custom `A` (compact remains) | `A` | no | Single Loop on `A` | yes |
| `-default -stop -compact` plus custom `A` | `A` | no | Single Loop on `A` | no |
| `-default -stop -compact` plus custom `A`, `B` | `A`, `B` | yes | Phase-less entry Loop; `entryPhaseId=A` enters `A` | no |
| `-default -stop` (only `compact` remains) | empty | no | Phase-less Single Loop | yes |
| `-default -stop -compact` (nothing else) | empty | no | Phase-less Single Loop | no |

When `route` remains, removing `stop`:

- `route(stop)` remains a terminal control target even when the Stop Phase is absent.
- When the current Phase already produced final text, the Run completes with that output.
- When the current Phase has no final text, the Run completes with the current Phase's terminal outcome using the existing empty-message fallback. It does not make an extra Stop-Phase model pass.
- The route description must not claim that a built-in Stop Phase will provide a conclusion when `stop` is not selected.

Removing `compact`:

- Automatic pre-Run compaction skips when `compact` is not selected, allowing the original Run to execute normally.
- Context-overflow recovery skips the compaction attempt when `compact` is not selected and preserves the original provider failure.
- An explicit `compactContext` call or any Control Phase Run targeting `compact` follows the existing missing-Control-Phase failure path with `Phase "compact" not found in Configuration Snapshot.`

While `compact` remains selected, automatic compaction, context-overflow recovery, and explicit Control Phase Runs use their existing behaviour in every Loop shape. Compaction does not depend on whether `route` is present.

Any other Control Phase Run targeting a removed Phase uses that same existing failure path. No replacement Phase, default entry, or silent no-op is introduced.

`route` is unchanged:

- It is reserved and cannot be selected or removed by a resource list.
- Its schema still exposes `stop` as a terminal control target.
- It is synthesized only when `|R| >= 2`. Its catalog contains `R`, and its schema otherwise follows existing behaviour.

### Model-facing Tool consequences

The resolved Tool Capability set is the single input for:

- the Provider request's Tool definitions;
- `ProviderCallContext.tools.list()`, with `route` excluded as today;
- the System Prompt's available-Tool section, snippets, and Tool guidelines;
- direct `ProviderCallContext.tools.call()` and model-issued Tool calls;
- Phase Tool filtering, including parallel Phase execution and the `compact` internal loop.

A removed Tool is absent from all these surfaces. Its own prompt snippet, description, and guidelines are absent. A model call using the removed name follows the existing unknown-Tool path and returns a non-executing error. Retained Tools continue through `before_tool_call` unchanged.

### Convergence plan

Current selection behaviour is implemented in these separate places:

- one generic allowlist helper used by base Context, Skill, Tool, and Phase selection;
- Definition Layer name-intersection helpers for Tools and Skills;
- a separate Definition Layer Phase-selection intersection;
- a Core-resource partition helper that re-adds Core Tools and Core Phases after selection;
- a second Tool/Skill/Context/Phase selection pass during Runtime assembly, including another Core partition and entry-Phase special case;
- a Phase-local Tool partition that re-adds every Core Tool and appends `route`;
- Phase frontmatter parsing that reuses Definition normalization only for `tools`;
- unconditional Core Phase normalization that re-injects all three built-in Phases at execution time;
- separate entry-Phase validation and defaulting in snapshot resolution, assembly, and runtime normalization.

Converge them as follows:

1. One parser normalizes all selector lists and produces the same diagnostics.
2. One base resolver applies the generic Core and non-Core rule for all kinds.
3. One parent-aware resolver performs Definition Layer and Phase narrowing.
4. Configuration Snapshot resolution uses the module for Definition and Layer values and records its effective result.
5. Runtime assembly consumes the snapshot-selected Host and Extension values; it does not re-select Skills, Contexts, authored Phases, or normal Tools.
6. Assembly materializes only the selected Rowan-generated Core Tools through the same module, so an excluded or replaced name cannot be restored.
7. Phase execution uses the parent-aware module for `Phase.tools` and then appends reserved `route`.
8. Runtime Phase normalization validates the selected registry and entry; it no longer injects removed Core Phases.
9. Entry-Phase resolution has one owner, with the deletion rules above.

Keep these adjacent behaviours separate:

- Resource Registry duplicate-name validation, because it is registration validation, not selection.
- `mergeSkills`, because it replaces concrete Skill values from `bundledSkills` and Phase Bundles rather than selecting named Scope resources.
- Reference filtering by selected names, after selection has produced the effective names.
- Route Tool synthesis and Phase routing, because `route` is not a selectable Resource Candidate.

### Configuration Snapshot and restart

The effective resource selection is resolved into the immutable Configuration Snapshot for the Run. The snapshot records the surviving source-qualified Host and Extension resources and enough normalized selection information to reproduce Rowan-generated Core resources and Core Phase exclusions.

An active or input-waiting Run keeps that snapshot if the Agent Configuration changes. The ConfigProvider may return the frozen snapshot directly or rebuild from the same Agent Configuration and Resource View; both paths must select the same resources. Process restart must not resurrect a removed resource, replacement, Core Phase, or prompt guidance.

### Compatibility and diagnostics

Omitted lists, `[]`, and positive-only lists preserve their current selected resource sets, apart from newly removable Core resources when a negative entry is present. Existing definitions, Phase files, Mori configurations, and CLI configurations with no negative entries require no migration.

Validation diagnostics come from the same module, so negative entries behave consistently across Tools, Skills, Phases, and Contexts.

The implementation must update the Core Resource, Definition Layer, and selection wording in the domain glossary and record the new default-removable Core rule in a new ADR. The ADR must amend ADR-0013 and ADR-0016 and clarify that ADR-0007's list semantics now use the shared Resource Selection module.

## Testing Decisions

A good test exercises externally observable resource selection through the public Agent Runtime. It should not assert private resolver branches, object identity, or internal map order.

Use one high-level seam: an Agent driven by a scripted Provider, with real Resource registration, Configuration Snapshot resolution, ConfigProvider persistence, and SQLite restart where durability is under test. Capture Provider requests, the System Prompt, `ProviderCallContext.tools.list()`, `ProviderCallContext.tools.call()`, `listInvocations`, Phase execution, Tool execution counters, and `before_tool_call` observations.

No second module-level seam is needed. The generic module's externally meaningful behaviour is reachable through Definition, Layer, Phase, assembly, restart, and runtime entry paths at the Runtime seam. A low-level parser test would duplicate the same cases and freeze internal structure.

Existing scripted-Provider Runtime tests for same-name Core replacement, Definition and Phase narrowing, Provider Tool context, unknown-Tool tolerance, Core Phase controls, and SQLite restart are the prior art. Tests should follow that style rather than adding a unit seam for each selector helper.

Required scenarios:

1. Omitted and `[]` keep every Core Tool and Core Phase; `[]` still selects no non-Core resource.
2. Positive-only Tool, Skill, Phase, and Context lists retain their Core defaults and select only the named non-Core values.
3. Negative-only lists modify the inherited selection for every resource kind.
4. Mixed lists select their positive non-Core values and remove their negative names.
5. A Layer can remove inherited Tools, Skills, and Phases, but cannot add an unseen resource or restore one removed by the parent.
6. A Phase can narrow its remaining Tools with positives or negatives and cannot re-add an Agent-removed Tool in serial or parallel execution.
7. Removing each Rowan Core Tool removes it from the Provider request, `ProviderCallContext.tools.list()`, and its own System Prompt guidance; a model call returns the unknown-Tool result without executing it.
8. A same-name Tool replacement is removed by the same name; its execute callback is not called and the built-in implementation does not reappear.
9. A removed Core Phase is absent from `PhaseRegistry`, `listInvocations`, and the automatic route catalog.
10. Removing every Phase enters the Phase-less Single Loop; `route` is absent from the model Tool list, `ProviderCallContext.tools.list()`, and the System Prompt, and a manual `route` call returns the unknown-Tool result.
11. Exactly one auto-invocable Phase enters a Single Loop on that Phase, using its prompt, narrowed Tools, and Skills without `route`.
12. A sole auto-invocable `stop` Phase is used literally as the Single Loop Phase without special-casing. A selection that leaves only `compact` runs the Phase-less Single Loop.
13. Removing `default` while keeping at least two auto-invocable Phases and no explicit entry starts the Phase-less entry Loop with `route`; the model can route into a selected Phase. An explicit valid `entryPhaseId` still enters that Phase directly.
14. `route` is present exactly when `|R| >= 2`; the no-negative-entry core configuration keeps `R = {default, stop}` and the same route catalog and schema as before.
15. `-stop` leaves `R = {default}`, removes `route`, and runs a Single Loop on `default`; `-stop -compact` keeps `R = {default}` and also runs a Single Loop on `default`.
16. While `compact` remains selected, automatic, overflow, and explicit Control Phase compaction keep working in every Loop shape. Removing `compact` skips automatic and overflow compaction, preserves the original provider failure, and makes an explicit compact Control Run fail through the existing missing-Phase path.
17. A Phase-less entry Loop with an explicit route target enters that Phase, and `previous` from its first routed Phase ends because the hidden entry is not a previous Phase.
18. A Control Phase Run targeting any removed Phase fails through the existing missing-Control-Phase path.
19. The Phase-less Single Loop completes a Tool round with hooks and finishes on the first ordinary text response.
20. A retained Tool still passes through `before_tool_call`, and its result still passes through `after_tool_call`.
21. An input-waiting Run keeps the original effective resources after an Agent Configuration update.
22. After Runtime restart with the same ConfigProvider and registered Sources, a new Run rebuilds the same reduced resource set in either Loop shape.
23. A Phase-less entry Loop suspends during a Tool call and resumes with the same routing configuration and no Phase prompt.

## Out of Scope

- Permission policy, path policy, command policy, approvals, and sandbox implementation.
- Adding a `-route` selector, changing route-catalog contents or schema, or introducing a Phase stack or new checkpoint shape for the Phase-less entry Loop.
- New syntax for Agent Definition references, Resource View Source IDs, Extension activation, or concrete values such as `bundledSkills`, Phase Bundle Skills, and additional Contexts.
- `+name`, `!name`, glob matching, ordering precedence, or a separate include/exclude setting.
- Run budgets, web search, knowledge bases, MCP, host business scope, package publication, and host migration.

## Further Notes

This PRD borrows only the useful part of pi's modifier behaviour: a non-empty list made only of negative entries modifies an inherited selection, while positive names describe an explicit selection. It intentionally does not borrow pi's `+name`, order-dependent modifier application, `!` resource-glob exclusion, or separate CLI include/deny flags.

The implementation requires a new ADR because it changes the accepted "always selected" rule for Core resources and moves several selection implementations behind one module. The ADR should distinguish capability existence from permission policy: explicit removal makes a resource absent; a retained Tool still goes through host policy on every call.
