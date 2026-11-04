# 0014: Single Loop

Status: ready-for-agent

## Parent

[PRD-0011](../prd/0011-explicit-resource-removal.md)

## What to build

The selected auto-invocable Phase set decides between routing, a Phase-hosted Single Loop, and a Phase-less entry Loop. Let `S` be the selected Phases and `R` those with `disableAutoInvocation !== true`. The existing `route` Tool remains exactly when `|R| >= 2`. Entry resolution is an explicit surviving `entryPhaseId`, then `default`, then the sole member of `R`, then a Phase-less entry Loop. The Phase-less entry Loop injects no Phase content; with `|R| >= 2` it starts with `route`, and with `|R| <= 1` it is a Single Loop without `route`. No configuration error is introduced for a missing entry. Compaction follows `compact` selection, not Loop shape.

## Acceptance criteria

- [ ] A selection with `|R| = 0` enters the Phase-less Single Loop; `route` is absent from the model, Provider context, and System Prompt, and calling `route` follows the unknown-Tool path.
- [ ] A selection with `|R| = 1` enters a Single Loop on that auto-invocable Phase with its prompt, narrowed Tools, and Skills; a sole `stop` is treated literally.
- [ ] `route` appears exactly when `|R| >= 2`; the no-name core configuration keeps `R = {default, stop}` and the old route behaviour.
- [ ] A no-entry configuration with `|R| >= 2` starts the Phase-less entry Loop with `route`; it injects no Phase prompt and can route into a selected Phase.
- [ ] In that Phase-less entry Loop, `previous` from the first routed Phase ends, and `route(stop)` remains terminal when `stop` is not selected.
- [ ] Single Loop runs a Tool call and final text response, commits the text as the Outcome, and reuses the existing internal model loop.
- [ ] Tool hooks, Run Interactions, suspension and resume, cancellation, Execution Checkpoint, restart recovery, and the existing loop limit continue to work in both Loop shapes.
- [ ] While `compact` is selected, automatic, overflow, and explicit Control Phase compaction keep their existing behaviour in every Loop shape.
- [ ] Removing `compact` skips automatic and overflow compaction and leaves explicit Control Runs on the existing missing-Phase failure.
- [ ] With `|R| >= 2` and `route` present, removing `stop` lets `route(stop)` complete without the Stop Phase.
- [ ] Public Agent Runtime tests with a scripted Provider cover the full Single Loop, removal of one Phase while others remain, and Control Phase behavior.

## Blocked by

- 0012 Share resource selection
- 0013 Runtime resource assembly
