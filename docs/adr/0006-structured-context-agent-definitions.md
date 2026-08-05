---
status: accepted
---

# Select structured Context through Agent Definitions

Rowan will extend its generic `AgentDefinition` with named structured Contexts
selection and replace the separate top-level `entryPhase`/Phase-name list with
a JSON-serializable PhaseRegistry selection. A host supplies named JSON-safe
Context Candidates in `AgentConfig.resources`; Rowan selects them with the
same omitted/empty/named semantics as other candidates, formats the selected
values using its XML formatter, and injects them into the System Prompt.

The Definition Phase selection is `{ entryPhaseId, phaseIds }`, mirroring the
PhaseRegistry's entry-plus-membership model without serializing executable
Phase objects. The top-level `entryPhase` field is removed. Rowan intersects
only candidate Phase names, applies the requested entry afterward, and warns
then falls back to `default` when the selected entry is unavailable.

This amends ADR-0005. It remains deliberately host-agnostic: Rowan does not
recognize a host's Context names or schemas, and hosts never pass prebuilt XML.

## Consequences

- Context is immutable configuration input, so a started or input-waiting Run
  remains attached to the exact selected values in its Configuration Snapshot.
- Context candidates cannot grant Tools, Skills, Phases, Extensions, or host
  authority; they affect only the System Prompt.
- The public change is breaking. There is no compatibility parser for a
  top-level `entryPhase` or old string-array `phases` Definition field.
