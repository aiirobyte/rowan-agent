# Rowan v0.4.4 Spec

Last updated: 2026-05-14
Status: Complete

## Version Goal

Refactor Agent run persistence and data flow to match the Pi-style split described in `docs/architecture/pi-recording-persistence.md`.

v0.4.4 directly replaces the old whole-state JSON `AgentStore` path. No compatibility bridge, migration-on-load, or legacy `<session-id>.json` support is required.

Target shape:

```text
Agent
  -> live memory and run lifecycle

Agent loop
  -> route / plan / execute / verify ordering
  -> produced messages, Outcome

SessionManager
  -> append-only JSONL Session entries
  -> current leaf and branch selection
  -> AgentContext reconstruction

CLI / composition root
  -> opens SessionManager
  -> appends message and outcome entries around Agent.run()
```

## Why This Version Exists

Rowan already separates `AgentEvent`, `ExecutionTurn`, `ContextScope`, and run logs, but persistence still rewrites one JSON document that combines Session state and execution steps.

That creates the wrong center of gravity:

- a long run is durable only after `Agent.run()` returns;
- conversation history and phase driver history are coupled in one file;
- `Agent` keeps a durable `Session` object in public state;
- context reconstruction is implicit in `session.messages` instead of an explicit persistence operation;
- future branch, compaction, replay, and eval work would have to tunnel through the old Session aggregate.

Pi has the better module split: Agent memory is live and fast, while durable Session history is append-only and externally reconstructed.

## Core Behavior

- `packages/session` owns Session entry contracts, in-memory SessionManager behavior, and `AgentContext` reconstruction rules.
- `packages/store` owns local JSONL filesystem persistence for the SessionManager interface.
- `packages/agent` stops exposing durable `state.session` as the primary public state. It keeps `state.sessionId` and live `state.context`.
- `runAgentLoop()` should move toward accepting `sessionId + AgentContext` and returning produced messages plus `Outcome`, rather than treating a durable Session object as its output.
- CLI persistence becomes append-only at the composition root: user messages are appended before the run, assistant conversation messages and `Outcome` are appended after the run, and execution details are observed through normal `AgentEvent` logs.
- Run logs remain observability only.

## Scope

### In Scope

- Add append-only Session entry types:
  - `header`;
  - `message`;
  - `execution_turn`;
  - `outcome`;
  - `session_info`;
  - `compaction`;
  - `branch_summary`;
  - `custom`.
- Add a `SessionManager` interface with append, branch, list, and context reconstruction operations.
- Add an in-memory SessionManager for fast tests.
- Add a local JSONL SessionManager in `packages/store`.
- Replace `LocalJsonAgentStore` usage in CLI tests and CLI runtime with the new manager.
- Update CLI session files to use `<session-id>.jsonl`.
- Persist conversation messages from public Agent events and run output.
- Refactor `Agent` state toward live memory:
  - `state.sessionId`;
  - `state.context`;
  - `state.currentResult`;
  - `state.error`;
  - no durable `state.session` dependency for callers.
- Keep `ContextScope` filtering: conversation messages reconstruct model-visible history by default; execution/diagnostic entries remain durable but not automatically visible.
- Update package README/module-map docs to describe the new persistence split.

### Out Of Scope

- No legacy JSON `AgentStore` compatibility.
- No migration-on-load from old `<session-id>.json` files.
- No database.
- No full replay engine.
- No full compaction algorithm beyond typed entries and reconstruction hooks.
- No v0.5.0 provider IR or context projection implementation.
- No compatibility shims for removed `LocalJsonAgentStore`, `InMemoryAgentStore`, or `AgentStore` APIs.

## Architecture

### Ownership

```text
packages/session
  -> AgentMessage, Skill, ContextScope
  -> SessionEntry schemas
  -> SessionManager interface
  -> in-memory append-only manager
  -> buildAgentContext()

packages/store
  -> LocalJsonlSessionManager
  -> filesystem safety, JSONL parsing/writing, list/delete

packages/agent
  -> Agent live memory reducer
  -> event fanout, cancellation, run lifecycle
  -> Agent loop ordering, task/thread semantics, outcomes

packages/cli
  -> composition root
  -> creates/opens SessionManager
  -> appends persistence entries as the run streams
```

### Session File Format

`<workspace>/sessions/<session-id>.jsonl` contains one JSON object per line.

First line:

```json
{"type":"header","id":"ses_...","version":"0.4.4","createdAt":"...","updatedAt":"...","systemPrompt":"...","input":"...","skills":[]}
```

Later lines:

```json
{"type":"message","id":"entry_...","parentId":"entry_...","timestamp":"...","message":{"role":"user","content":"hello"}}
{"type":"outcome","id":"entry_...","parentId":"entry_...","timestamp":"...","outcome":{"passed":true,"message":"..."}}
```

The manager tracks a current leaf. Branching changes the selected leaf without rewriting existing history.

### Context Reconstruction

`SessionManager.buildAgentContext()` walks from the selected leaf to the header, keeps conversation-scope `message` entries, restores `systemPrompt` and `skills`, and ignores `execution_turn`, `outcome`, diagnostic, and execution messages unless a future projection layer asks for them explicitly.

## Testing

Required verification:

```bash
bun test packages
bun run build
```

Focused tests:

- In-memory SessionManager appends messages and reconstructs `AgentContext`.
- Execution turns append without entering model-visible context.
- Branching moves the active leaf and changes reconstructed context.
- Local JSONL manager writes line-delimited entries and lists sessions by latest activity.
- CLI creates `.jsonl` session files and does not create `.json` session files.
- CLI `--session` reconstructs context from JSONL entries.
- Agent public state exposes live `sessionId/context` without requiring durable `state.session`.
- Multi-turn direct/task behavior remains intact.

## Acceptance

- `docs/version/0.4.4/` contains spec, prompt plan, and todo files.
- Root docs point to v0.4.4 as the active version inserted before v0.5.0.
- `LocalJsonAgentStore`, `InMemoryAgentStore`, and `AgentStore` are removed or replaced by the new manager APIs.
- No old JSON session compatibility remains.
- CLI persistence uses append-only JSONL session files.
- Agent state is live-memory oriented.
- Existing direct, task, thread, multi-turn, limits, invalid schema, invalid tool args, and verify retry behavior remains covered.
- `bun test packages` passes.
- `bun run build` passes.

## Implementation Summary

Completed on 2026-05-14.

- Added `SessionManager` contracts, append-only `SessionEntry` types, context reconstruction, and `InMemorySessionManager` in `packages/session`.
- Added `LocalJsonlSessionManager` in `packages/store` and removed the old whole-state `AgentStore` implementations and exports.
- Refactored `Agent` public state toward live `sessionId/context` and changed run results to expose `sessionId` plus produced messages instead of a durable Session aggregate.
- Updated CLI persistence to create/open JSONL sessions, append user messages before runs, and append assistant messages plus Outcomes after runs. Execution details stay in the AgentEvent log.
- Updated docs, package versions, lockfile, and package boundary rules for the new persistence direction.

## Verification

```bash
bun test packages
bun run build
```
