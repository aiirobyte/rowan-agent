---
status: accepted
---

# Host-defined resources replace built-ins by name

> **Amended by [ADR-0018](0018-shared-resource-selection-and-single-loop.md):**
> Core Resources are selected by default, not always selected. A host or
> Extension same-name replacement still wins by name, but an explicit `-name`
> removes the winning value for that Agent.

ADR-0013 amends ADR-0007's core resource reservation and collision rule. Rowan
will allow host-defined and Extension-registered resources to directly replace
Rowan built-ins with the same name (`read`, `edit`, `write`, `bash` Tools, and
`default`, `stop`, `compact` Phases), rather than rejecting them with a
collision error or silently ignoring them.

## Decision

- After host-defined Tools and Extension-registered Tools are merged, a Tool with
  the same name as a Core Tool directly replaces that Core Tool.
- The same rule applies to built-in Phases: a host or Extension Phase named
  `default`, `stop`, or `compact` replaces the built-in Phase rather than being
  dropped or throwing a collision error.
- Resource precedence order is: Host sources (more specific) > Extension
  sources (`rowan.extensions`) > Rowan built-in core (`rowan.core`).
- A replacing resource retains the built-in resource's status:
  - A replaced Core Tool is selected by default across Agent Definitions, but
    an explicit `-name` removes the winning replacement.
  - A replaced Core Phase retains the built-in Phase's role (routing, default
    entry, stop, or compact).
- Existing Scope override behavior for non-core resources is unchanged: more
  specific Scope sources win over broader ones, and peer host sources within the
  same Resource View collide as before.
- Reserved control names cannot be claimed and reject registration: `route` for
  Tools and `continue` for Phases.
- No new public API or configuration options are introduced; the merge
  precedence is handled entirely within the existing assembly and resolution seams.

## Consequences

- Hosts can cleanly route core operations (such as document session edits or
  workspace reads) through custom Tools without Rowan dropping them.
- Hosts can supply custom `default`, `stop`, or `compact` Phases without throwing
  configuration collisions.
- Agent Definitions do not need to name replaced Core Tools in their `tools`
  allowlists to make them available.
