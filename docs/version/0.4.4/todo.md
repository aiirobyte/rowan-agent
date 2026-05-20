# Rowan v0.4.4 Todo

Last updated: 2026-05-14
Status: Complete

## Version Target

Target: v0.4.4 Agent Run Persistence And Data Flow Refactor.

Definition of done:

- [x] Create `docs/version/0.4.4/spec.md`.
- [x] Create `docs/version/0.4.4/prompt_plan.md`.
- [x] Create `docs/version/0.4.4/todo.md`.
- [x] Update root `docs/spec.md`, `docs/prompt_plan.md`, and `docs/todo.md`.
- [x] Update `docs/version/README.md` and `docs/README.md`.
- [x] Add SessionManager entry contracts in `packages/session`.
- [x] Add `InMemorySessionManager`.
- [x] Add `buildAgentContext()` reconstruction from append-only entries.
- [x] Add `LocalJsonlSessionManager` in `packages/store`.
- [x] Remove old JSON AgentStore APIs and references.
- [x] Update CLI to use JSONL SessionManager persistence.
- [x] Persist user messages before Agent runs.
- [x] Persist assistant conversation messages and Outcomes from run output/events.
- [x] Keep execution details in normal AgentEvent logs instead of `recordStep`.
- [x] Refactor Agent public state to live `sessionId/context` rather than durable `state.session`.
- [x] Refactor run output away from durable `result.session`.
- [x] Preserve direct, task, thread, multi-turn, limits, invalid schema, invalid tool args, and verify retry behavior.
- [x] Update READMEs and architecture docs.
- [x] Run `bun test packages`.
- [x] Run `bun run build`.
- [x] Update root docs after v0.4.4 completion.

## Next Prompt

v0.4.4 is complete. Next version handoff: prepare v0.5.0 Context Projection And Provider IR planning before starting implementation.

## Guardrails

- Do not keep compatibility for old `<session-id>.json` files.
- Do not add migration-on-load.
- Do not keep `LocalJsonAgentStore`, `InMemoryAgentStore`, or `AgentStore` as compatibility shims.
- Do not make `Agent` own durable persistence.
- Do not make run logs replay truth.
- Do not start v0.5.0 context projection or provider IR.

## Planning Notes

- 2026-05-14: User explicitly inserted v0.4.4 before v0.5.0 for Pi-style persistence and data-flow refactoring.
- 2026-05-14: User explicitly rejected old-version compatibility. v0.4.4 should directly replace the old JSON AgentStore persistence path.
- 2026-05-14: v0.4.4 implementation completed with `bun test packages` and `bun run build` passing.
- Update this file after every meaningful coding session.
