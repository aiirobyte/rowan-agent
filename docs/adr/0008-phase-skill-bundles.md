---
status: accepted
---

# Load direct Skills as part of each file Phase Bundle

Rowan's file Phase resources currently carry Skill name selectors that filter a
flat Agent Skill pool. Rowan will instead load a file Phase together with its
direct child Skill directories as one immutable Phase Bundle, while keeping
Scope-level `loadSkills` shallow and keeping Workflow out of Rowan's domain.

## Decision

- `loadSkills(directory)` continues to load only the directory itself or its
  direct child `SKILL.md` markers. It never searches Phase or Workflow trees.
- `loadPhase(directory)` loads `PHASE.md`, its existing execution code, and
  direct child `SKILL.md` directories. The returned `Phase` owns concrete
  Skills for the Bundle; a programmatic Phase has an empty Skill list.
- A child marker at the wrong depth or of the wrong kind, a duplicate local
  Skill name, malformed child metadata, or child execution-load failure makes
  the parent Phase Bundle invalid. The loader never returns a partial Bundle.
- Phase `skills` frontmatter is no longer a Skill name selector. Hosts may
  retain and silently ignore the legacy field at their parsing edge; Rowan's
  file Phase loader uses the Bundle children.
- The default Phase remains an implicit root Phase. The active Definition's
  selected Scope Skills are used while it is active; entering a file Phase
  replaces them with that Phase Bundle's Skills, and returning to default
  restores them.
- Serial, parallel, factory, Extension, route, input-resume, and checkpoint
  paths all consume the active Phase Context Skills. The route Tool does not
  advertise child Skill names before entry.
- Extension Phase registration accepts an asynchronous directory Bundle and
  delegates to the same loader. Activation is transactional; an invalid Bundle
  leaves no partial Extension contribution. Internal inline host Phases remain
  possible with empty Skills.
- Configuration snapshots deep-freeze Phase Bundle values. A source revision
  identifies the top-level Phase contribution; child Skills have no independent
  Source ID or revision. Existing Run/store schema and recovery boundaries stay
  unchanged; a host that cannot rebind a Phase reports its existing
  configuration-unavailable failure.
- Rowan remains unaware of Workflow, Scope, parent ownership, installations,
  filesystem security, and business permissions. A host supplies Resource Views
  and decides which Bundle registry is active.

## Consequences

- `Phase.skills` becomes concrete Bundle data rather than a file selector, a
  breaking public contract for Rowan 0.9.0.
- Phase visibility is a progressive-disclosure boundary, not a filesystem
  sandbox. Existing Tools retain their host-authorized filesystem behavior.
- Resource Registry source transactions remain shallow and source-qualified;
  nested Skill identity is contained inside one Phase value.
- The existing Resource View, Definition selection, source revision, and
  Configuration Snapshot seams remain useful and do not learn Workflow.

## Rejected options

- Recursively scan one mixed directory for all Skills: rejected because it
  destroys Bundle ownership and allows unrelated Phase/Workflow children to
  leak into Scope-level Skill candidates.
- Keep Phase Skill names and filter the global pool: rejected because omitted
  names inherit unrelated Scope Skills and cannot express replacement on entry.
- Add a generic nested Resource registry: rejected because it exposes children
  as independent sources and recreates host dependency semantics.
- Make Bundle visibility a file sandbox: rejected because Rowan's existing
  Tool root is not a security boundary and the host owns filesystem authority.
