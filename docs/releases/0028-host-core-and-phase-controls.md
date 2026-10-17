# Rowan Agent 0.25.0 — host-declared core resources and Phase controls (ADR-0016)

## Core is a registration attribute

A Tool or Phase a host registers with `core: true` is always selected: no
Definition list, Definition Layer, or Phase `tools` filter removes it, and a
core Phase enters the automatic route catalog. `core` in frontmatter is
ignored. Host replacement of Rowan's own core names is unchanged.

## `previous` route target

`route({ decision: [{ phase: "previous" }] })` returns to the Phase that routed
into the current one, or stops when there is none. A Phase may declare
`target: previous`. No resource may be named `previous`.

## PHASE.md `prompt-guidelines`

A list of strings that joins the System Prompt Guidelines while the Phase is in
the automatic route catalog, de-duplicated with Tool guidelines.

## Control Phase Runs

```ts
await runtime.runPhase(agentId, {
  phase: "memory",
  payload: { action: "capture" },
  yieldToInput: true,
});
```

The Run enters `phase` with `payload` as its Phase Payload. Empty `input` adds
no user message, and the outcome is not displayed. With `yieldToInput`, a new
ordinary Run for the Agent cancels it. `compactContext` and auto-compaction now
run as Control Phase Runs.

- Breaking: Run metadata `rowan.kind: "compact"` is gone; compaction Runs carry
  `{ kind: "phase", phase: "compact", payload }`, with `instructions` in the
  payload.

## Packages

- `@rowan-agent/agent` 0.25.0
- Other package versions unchanged
