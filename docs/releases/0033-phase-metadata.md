# Rowan Agent 0.29.0 — Phase metadata and Tool Call provenance

## Extra frontmatter becomes `Phase.metadata`

Hosts can extend `PHASE.md` frontmatter with custom properties (Mori adds
`permissions:`) that Rowan passes through without interpreting.

- Known keys (`name`, `description`, `target`, `input`, `prompt-guidelines`,
  `tools`, `model`, `isolated`, `disable-auto-invocation`,
  `disable-implicit-invocation`, and the legacy ignored `skills`) are handled by
  Rowan and never enter `Phase.metadata`.
- Every other key goes into `Phase.metadata?: Readonly<Record<string, JsonValue>>`
  unchanged when its value is JSON-safe (string, finite number, boolean, null,
  and arrays or plain objects of these, recursively). Nested structures and
  lists are preserved.
- Non-JSON-safe values (such as YAML timestamps/Dates) are dropped with a
  resource diagnostic naming the invalid key.
- If a Phase declares no extra frontmatter keys, the `metadata` property is
  omitted (`undefined`).
- Field-by-field Phase copy and snapshot routines (`snapshotPhase`,
  `ResourceRegistry`) preserve `metadata` (frozen). Inline code Phases may set
  `metadata` too.

## Tool calls know their Phase

Tool calls and extension hooks now carry provenance of the Phase that issued
them:

- `ToolCallContext` gains `phase?: ToolCallPhase` — `{ name, metadata? }`, exported
  from the package.
- `BeforeToolCallEvent` and `AfterToolCallEvent` gain the same `phase?` field.
- `createPhaseExecution` passes `{ name, metadata }` through `executeToolCall`
  and `executeToolCalls` into `runtime.tools` and `runtime.toolsBatch`.
  The durable runtime attaches this Phase descriptor to every `ToolCallContext`
  it builds (both the batch pre-decision path and the per-call execution path).
  This covers model Phases, `execution.executeTools`, and
  `execution.runInternalModelLoop` alike.

## Packages

- `@rowan-agent/agent` 0.29.0
- Other package versions unchanged
