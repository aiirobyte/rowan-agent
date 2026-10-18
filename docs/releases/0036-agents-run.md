# Rowan Agent 0.32.0 — `api.agents.run`

An Extension can read one Run in full: `api.agents.run(runId)` returns its `RunSnapshot`, including the outcome once the Run ended. `api.agents.runs` lists summaries, which carry no outcome; a host that needs to tell Runs apart by their outcome payload (for example a compaction) no longer has to reach into the runtime itself.

## Packages

- `@rowan-agent/agent` 0.32.0
