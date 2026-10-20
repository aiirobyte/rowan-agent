# Rowan Agent 0.36.4 — Live Interaction Phase

A live Interaction (one raised while a tool or the model call runs) now carries the Run's current Phase. Before, `RunInteraction.phase` was always `"default"`; it is read from the Run's `currentPhaseId`, falling back to `"default"` only when the Run has none. It shows in snapshots, live Interaction events, and the child report path.

No new events, fields, or options.

## Packages

- `@rowan-agent/agent` 0.36.4
