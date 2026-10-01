# Rowan Agent 0.15.1 — compact Phase commits context compaction inside normal Runs

Previously, the built-in `compact` Phase only generated a summary payload, and the summary was written back as a context compaction (`owned.commitContextCompaction`) in only two places: the dedicated control compact Run (`controlKind === "compact"`, `runtime.compactContext`) and the context-overflow retry branch. When hosts routed `compact` like any other Phase — as the single entry Phase (`entryPhaseId = "compact"`), as one of several parallel `entryPhases`, or as a serial or parallel route target mid-Run — the summary remained an uncommitted Phase output and conversation context was never compacted.

This release unifies compaction commits across all execution paths into the runtime's `afterPhase` hook. Whenever the compact Phase completes successfully inside any Run, its summary payload is committed as a durable context compaction using the same `claim.history.at(-1)` boundary semantics as overflow recovery, guaranteeing that concurrent sibling Phases' newly emitted messages are not swallowed. In addition, parallel phase executions now invoke `afterPhase` and report final status consistently with the serial phase runner. Control compact Runs and overflow retry paths route through this same seam without double-committing.

## Packages

- `@rowan-agent/agent` 0.15.1
- Other package versions unchanged
