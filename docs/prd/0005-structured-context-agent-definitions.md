# PRD: Structured Context Agent Definitions

## Status

Approved for implementation. This PRD supersedes PRD-0004's Definition
Phase/entry shape and extends its generic Resource selection contract.

## Problem

Hosts need to select immutable structured business Context through the same
declarative Definition mechanism as Tools, Skills, Phases, and Extensions.
They must not construct private System Prompt XML or teach Rowan their business
models. The current independent `phases: string[]` and `entryPhase` fields also
do not match the entry-plus-membership semantics of a PhaseRegistry.

## Outcome

Add generic named JSON Context Candidates to the Agent Configuration resource
boundary, add `contexts` selection to Agent Definitions, and model Definition
phase selection as a JSON-serializable PhaseRegistry selection. Rowan formats
selected Context with its existing XML utilities as part of System Prompt
assembly.

## Requirements

### R1: Definition schema

- `AgentDefinition` has optional `contexts?: readonly string[]` with the same
  validation and selection behavior as Tools, Skills, and Extensions.
- Its optional `phases` field is a PhaseRegistry selection object:

  ```ts
  type PhaseRegistrySelection = Readonly<{
    entryPhaseId: string | null;
    phaseIds: readonly string[];
  }>;
  ```

- A present `phases` object requires both fields. `phaseIds` is a deduplicated
  string list; `entryPhaseId` is a non-empty string or `null`.
- Top-level `entryPhase` and string-array `phases` are rejected. No
  compatibility representation is retained.
- Agent and Phase parsing continue to reuse common Definition normalization
  where their schemas apply.

### R2: Generic Context Candidates

- `AgentResources` accepts `contexts?: readonly { name: string; value:
  JsonValue }[]`.
- Context Candidate names follow the existing named-resource validation;
  duplicate names are rejected before execution.
- Omitted `definition.contexts` selects all offered Context Candidates, `[]`
  selects none, and a named list selects matching candidates. Missing names
  emit the same warning-and-skip behavior as named Resources.
- Rowan has no special Context names and does not inspect or alter a value's
  business meaning.

### R3: System Prompt and Run snapshots

- Build the System Prompt from the Definition prompt, resolved Tools/Skills,
  and selected Context. Serialize Context using the existing JSON-to-XML and
  XML escaping utilities, under stable generic Context markup.
- Hosts pass only `JsonValue`; no host preformats XML or concatenates Context
  into the Definition prompt.
- The resolved Context is part of the executable Agent Configuration. Config
  provider reconstruction and input-request continuation keep the original
  selected Context snapshot.

### R4: Phase resolution

- Resolve `phaseIds` against candidate/Extension phases after Extension
  assembly.
- If the Definition omits `phases`, retain the candidate registry selection.
  If it supplies it, retain only matching `phaseIds`.
- Apply the Definition `entryPhaseId` after selection. `null` means the
  default-phase path. A selected-but-unavailable non-null entry warns and uses
  the default path.

## Non-goals

- Host-specific Context schemas, names, authorization, or lifecycle rules
- Context-driven Resource selection or Tool authority
- XML values supplied by hosts
- Compatibility support for the old Phase Definition fields

## Acceptance

- Parser/public-interface tests prove Context and PhaseRegistry validation,
  rejection of legacy fields, and unchanged Tool/Skill/Extension semantics.
- Runtime tests prove omitted/empty/named Context selection, missing warnings,
  XML escaping/structured output, duplicate rejection, and snapshot pinning.
- Phase tests prove selection intersection, explicit null/default behavior,
  entry precedence, warning/fallback, and Extension-first resolution.
- Package tests, typecheck, build, public-interface check, and diff check pass.
