# 0013: Runtime Resource Assembly

Status: ready-for-agent

## Parent

[PRD-0011](../prd/0011-explicit-resource-removal.md)

## What to build

Runtime assembly consumes the effective resources already selected for the Configuration Snapshot. It no longer re-selects authored resources or unconditionally re-adds Core resources. Removed Tools disappear from every model and Provider-facing Tool surface, including same-name replacements, and removed Core Phases stay absent at execution time and from the route threshold.

## Acceptance criteria

- [ ] Configuration Snapshot resolution is the Agent-level selection owner; assembly only binds handlers and materializes selected Rowan-generated Core Tools.
- [ ] A removed Tool is absent from model Tool definitions, `ProviderCallContext.tools.list()`, its own System Prompt guidance, and direct or model-issued calls.
- [ ] A same-name Core Tool replacement is removed by the same name without falling back to the built-in implementation.
- [ ] Removed Core Phases remain absent from `PhaseRegistry`, `listInvocations`, and the automatic route catalog.
- [ ] The route threshold consumes the selected auto-invocable Phase set rather than a second assembly decision.
- [ ] Tool hooks and retained Tool execution continue unchanged.
- [ ] Pinned Runs and restart rebuilding produce the same effective resource set.
- [ ] Public Agent Runtime tests use one scripted-Provider seam and verify the observable surfaces.

## Blocked by

- 0012 Share resource selection
