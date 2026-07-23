# Agent Context and Run Event migration

`@rowan-agent/agent` 0.8.0 makes `AgentRun.observe()` the live presentation
interface while keeping reliable event consumption durable-only. This is a
breaking release with no compatibility overload.

## Required changes

- Treat `run.observe()` as `AsyncIterable<RunEvent>` and narrow on `kind` or
  `durability` before passing an event to a durable-only consumer.
- Render transient `message_delta` and `tool_progress` values only as
  best-effort live output. Use `message_committed` as the authoritative full
  content.
- Keep reliable processing on `runtime.consume()`, which still delivers only
  `DurableRunEvent` values with cursor/checkpoint semantics.
- Durable loggers must ignore transient events; transient events have no Event
  ID, Store cursor, or Run revision.
- Tools may report best-effort progress through
  `ToolInvocationContext.reportProgress(progress)`.

## Context assembly

- Continue supplying host resources through `AgentContext.tools`, `skills`, and `phases`.
- Do not pass `allowedTools`, `allowedSkills`, or `allowedPhases`; they are not part of `AgentOptions`.
- Remove Tool and Phase name collisions, including collisions with Rowan `route` and `default` controls.
- Expect code-defined Extension Tools to execute through Tool Runtime.

Ordinary PHASE.md Tool and Skill restrictions remain Phase-local. Reconstruction reassembles the current Context and configured Extensions.
