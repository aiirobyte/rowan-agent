# Rowan v0.4.4 Prompt Plan

Last updated: 2026-05-14
Status: Complete

## Version Target

Implement Pi-style Agent run persistence and data-flow refactoring. Replace the old whole-state JSON AgentStore with append-only JSONL SessionManager persistence, without legacy compatibility.

## Prompts

### Prompt 0: Version Planning

Status: Complete

Goal: Insert v0.4.4 before v0.5.0 and lock the no-compatibility persistence direction.

Expected next change:

1. Create `docs/version/0.4.4/spec.md`.
2. Create `docs/version/0.4.4/prompt_plan.md`.
3. Create `docs/version/0.4.4/todo.md`.
4. Update `docs/spec.md`, `docs/prompt_plan.md`, `docs/todo.md`, `docs/version/README.md`, and `docs/README.md`.
5. Keep v0.5.0 planned after v0.4.4.

Guardrails:

- Do not keep old JSON AgentStore compatibility.
- Do not start v0.5.0 context projection.

### Prompt 1: SessionManager Contracts

Status: Complete

Goal: Add append-only Session entry contracts and an in-memory SessionManager in `packages/session`.

Expected next change:

1. Add failing tests for append message, append execution turn, branch, list entries, and context reconstruction.
2. Define `SessionEntry`, `SessionHeader`, `SessionManager`, and `SessionManagerSessionListItem` types.
3. Implement `InMemorySessionManager`.
4. Ensure `buildAgentContext()` includes conversation messages and excludes execution/diagnostic records by default.
5. Export the new contracts from `@rowan-agent/session`.

Guardrails:

- Keep filesystem concerns out of `packages/session`.
- Keep provider/context projection work out of this prompt.

### Prompt 2: Local JSONL Store

Status: Complete

Goal: Replace `AgentStore` with a local append-only JSONL SessionManager implementation in `packages/store`.

Expected next change:

1. Add failing tests for `.jsonl` file creation, append-only writes, list/load/delete, path validation, and execution turn loading/filtering.
2. Implement `LocalJsonlSessionManager`.
3. Remove old `LocalJsonAgentStore`, `InMemoryAgentStore`, and `AgentStore` exports.
4. Update store README to describe JSONL SessionManager persistence.

Guardrails:

- Do not read or write old `<session-id>.json` files.
- Do not add migration-on-load.

### Prompt 3: Agent Live Memory State

Status: Complete

Goal: Refactor `Agent` toward Pi-style live memory while keeping existing loop behavior passing.

Expected next change:

1. Add/update Agent tests to assert `state.sessionId` and live `state.context`.
2. Remove public dependence on durable `state.session`.
3. Keep `Agent.run()` event fanout, abort, listener flushing, and multi-turn memory behavior intact.
4. Keep loop session internals as a transitional implementation detail only if needed for this prompt.

Guardrails:

- Do not move route / plan / execute / verify ordering out of `agent`.
- Do not reintroduce persistence ownership into `Agent`.

### Prompt 4: CLI Streaming Persistence

Status: Complete

Goal: Make CLI use SessionManager as the composition root and append entries during runs.

Expected next change:

1. Update CLI tests to expect `<session-id>.jsonl` session files.
2. Create/open `LocalJsonlSessionManager` in CLI.
3. Append the user message before `Agent.run()`.
4. Build `AgentContext` from `SessionManager.buildAgentContext()`.
5. Append assistant conversation messages and `Outcome` from run output/events.
6. Keep execution details in normal AgentEvent logs only.
7. Keep run logs as observability only.

Guardrails:

- Do not reintroduce `recordStep` or Agent-loop step persistence.
- Do not depend on `result.session`.
- Do not create `.json` session files.

### Prompt 5: Loop Output Shape Cleanup

Status: Complete

Goal: Move `AgentRunResult` and loop public output toward produced messages and session ids rather than durable Session aggregates.

Expected next change:

1. Update `AgentRunResult` to expose `sessionId`, `messages`, `outcome`, `limitUsage`, and `depth`.
2. Preserve thread result metadata: `parentSessionId`, `prompt`, `task`, `goal`.
3. Update tests and callers from `result.session` to `result.sessionId/result.messages`.
4. Keep internal Session construction private to the loop until later DCP work removes it.

Guardrails:

- Do not remove `ContextScope`.
- Do not start provider IR or projection work.

### Prompt 6: Regression And Docs Handoff

Status: Complete

Goal: Close v0.4.4 with docs, tests, and root handoff updated.

Expected next change:

1. Update package READMEs and `docs/architecture/module-map.md`.
2. Run `bun test packages`.
3. Run `bun run build`.
4. Mark v0.4.4 todo items complete with verification evidence.
5. Update root docs to hand off to v0.5.0 only after v0.4.4 is complete.

Guardrails:

- Do not mark complete without fresh verification.
- Do not leave docs claiming JSON AgentStore is current.

## Completion Checklist

- [x] Versioned docs created for v0.4.4.
- [x] Root docs point to v0.4.4 as active.
- [x] SessionManager contracts and in-memory implementation exist.
- [x] Local JSONL SessionManager replaces old JSON AgentStore.
- [x] Agent public state is live-memory oriented.
- [x] CLI uses streaming append persistence.
- [x] Loop/run result no longer exposes durable Session aggregate as the public output.
- [x] Old JSON AgentStore compatibility is removed.
- [x] `bun test packages`.
- [x] `bun run build`.
- [x] Root docs updated for v0.4.4 completion and v0.5.0 handoff.
