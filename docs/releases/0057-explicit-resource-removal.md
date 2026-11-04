# Rowan Agent 0.43.0 - Explicit resource removal and Phase-less loops

A host can now take resources away from an Agent by name, and an Agent with no
entry Phase runs as a plain model-and-Tool loop. A configuration that writes no
`-name` behaves exactly as before.

- **Explicit removal**: a selection entry written `-name` removes that value.
  It works on Tools (including the Core `read`, `edit`, `write`, and `bash`),
  Phases (including `default`, `stop`, and `compact`), Skills, and Contexts,
  wherever a selection list exists: Definitions, Definition Layers, and Phase
  `tools`. Omitted lists, `[]`, and positive names still keep every Core value.
  Removal wins over order, a `-name` that matches nothing warns and does
  nothing, and `+name` or `!name` is rejected.
- **Removed means absent**: a removed Tool is missing from the Tool list, from
  `ProviderCallContext.tools.list()`, and from System Prompt guidelines, and a
  call to it returns the unknown-Tool result. A same-name host replacement is
  removed by the same name, and a Phase's `tools` can only narrow what the Agent
  kept.
- **One selection module**: Tools, Skills, Contexts, and Phases share one
  Resource Selection module instead of one implementation per resource type.
- **route follows auto-invocable Phases**: `route` is present when at least two
  selected Phases allow auto-invocation. The default configuration keeps
  `default` and `stop`, so it is unchanged. With a single such Phase the Run is
  a single Loop on that Phase, without `route`.
- **Phase-less entry Loop**: the entry is an explicit `entryPhaseId`, then
  `default`, then the sole auto-invocable Phase, then a Loop with no Phase
  prompt, Tool filter, or Skill filter. That Loop keeps `route` when two or
  more Phases are auto-invocable and is a single Loop otherwise. Tool calls,
  hooks, Run Interaction, checkpoints, and restart recovery work as before, so
  `[-default, -stop]` gives a plain loop that still compacts.
- **Compaction follows `compact`**: automatic compaction, context-overflow
  recovery, and Control Phase Runs happen exactly when `compact` is selected,
  whatever shape the Loop has.

The effective result is frozen in the Configuration Snapshot, so a Run keeps
its resources across a later Agent Configuration update and a restart rebuilds
the same set.

## Packages

- `@rowan-agent/agent` 0.43.0
- `@rowan-agent/models` 0.15.0
