---
status: accepted
---

# Host-declared core resources and Phase controls

A host needs some of its own capabilities to behave like Rowan's: present in
every Agent whatever a Definition selects, routable back to the Phase that
called them, able to add System Prompt guidance while they are available, and
runnable by the host without a user message. Compaction already has each of
these, but only as special cases for `compact`. A host-shipped memory Phase is
the first resource that needs all four.

## Decision

- **Core is a registration attribute.** A resource value whose registrant sets
  `core: true` is core. Rowan never reads `core` from PHASE.md, SKILL.md, or
  Definition frontmatter. Rowan's own `rowan.core` resources stay core, and a
  host may still replace one by registering its name. A core Tool or Phase is
  always selected: no Definition list, Definition Layer, or Phase `tools`
  filter removes it. Only its registrant removes it, by unloading or replacing
  its source.
- **`previous` is a reserved route target**, next to `continue` and `stop`. No
  resource may be named `previous`. Routing to `previous` returns to the Phase
  that routed into the current one, taken from the latest recorded Phase
  transition of the Run; with none, it behaves as `stop`. A Phase may declare
  `target: previous`.
- **A Phase may declare `prompt-guidelines`**, a list of strings in its
  frontmatter. While the Phase is in the current route catalog, the lines join
  the System Prompt Guidelines, de-duplicated with Tool `promptGuidelines`. The
  Phase body still reaches the model only when the Phase executes.
- **A Control Phase Run enters any Phase.** `runPhase(agentId, { phase,
  payload?, input?, yieldToInput?, idempotencyKey? })` creates a Run with
  metadata `rowan: { kind: "phase", phase, payload }`. It enters `phase` with
  `payload` as its Phase Payload. Empty `input` adds no user message; its outcome
  is not displayed, as compaction's is today. With `yieldToInput`, creating an
  ordinary Run for the same Agent cancels the Control Phase Run if it has not
  completed. `compact()` becomes `runPhase` of `compact`, and the special
  `kind: "compact"` path is removed.

## Consequences

- A host can ship an always-present Phase without patching Definitions, and
  turn it off by unloading it.
- Phases that act as subroutines (memory, lookup) return to their caller
  without the caller's name being known in advance.
- Guidance for a capability lives with the capability and disappears with it.
- Automatic compaction and host-triggered Phases share one Run path.

## Rejected options

- `core` in resource frontmatter: authors could promote their own resources;
  the decision belongs to whoever installs them.
- A `caller` target or a Phase name in the payload: the runtime already records
  the transition, so the model need not carry it.
- A separate background job outside Runs for host-triggered Phases: it would
  bypass durable state, events, and recovery.
