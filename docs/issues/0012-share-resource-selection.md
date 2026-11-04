# 0012: Share Resource Selection

Status: ready-for-agent

## Parent

[PRD-0011](../prd/0011-explicit-resource-removal.md)

## What to build

Every selectable Resource kind resolves through one shared Resource Selection module. Definition, Definition Layer, and Phase lists understand `-name`; Core resources remain selected by default; Definition Layer and Phase narrowing are monotonic; missing names and malformed entries use the same diagnostics. Phase entry resolution counts the selected set after this module runs.

## Acceptance criteria

- [ ] Omitted, empty, positive-only, negative-only, and mixed lists use the documented generic rule for Tools, Skills, Phases, and Contexts.
- [ ] A Definition Layer can remove inherited resources but cannot add an unseen resource or restore one removed by its parent.
- [ ] A Phase can narrow its remaining Tools but cannot add back an Agent-removed Tool.
- [ ] Core Tools, Core Phases, and host or Extension `core: true` resources are selected by default and removable only by `-name`.
- [ ] The effective Phase set and entry Phase are resolved once from the same selected names, with an explicit surviving entry, then `default`, then the sole auto-invocable Phase, then no Phase entry.
- [ ] The separate Tool/Skill and Phase Layer intersection helpers, Core partition helper, and duplicate list normalization are replaced by the shared module.
- [ ] Public Agent Runtime tests with a scripted Provider cover the generic rule and diagnostics.

## Blocked by

None (can start immediately)
