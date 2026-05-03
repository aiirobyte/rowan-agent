# Rowan v0.3.1 Task Board

> 版本：v0.3.1
> 日期：2026-05-01
> 状态：implemented

## 1. Milestones

| Milestone | Goal |
|---|---|
| M0 | Planning and version scope |
| M1 | Persistent Session data model |
| M2 | Agent multi-turn semantics |
| M3 | CLI session commands |
| M4 | Interactive chat mode |
| M5 | Trace/session linkage |
| M6 | Release verification |

## 2. Tasks

| ID | Milestone | Task | Type | Priority | Depends On | Status | Acceptance |
|---|---|---|---|---|---|---|---|
| V031-001 | M0 | Add v0.3.1 planning docs | docs | P0 | - | done | `PLAN.md`, `TASKS.md`, `README.md` exist and roadmap links to them |
| V031-002 | M0 | Decide Session persistence location | design | P0 | V031-001 | done | `<workspace>/sessions` is documented and implemented |
| V031-101 | M1 | Add persisted Session schema/version | session | P0 | V031-002 | done | Session JSON includes `version`, id, messages, skills, timestamps, optional title |
| V031-102 | M1 | Add SessionStore interface | session | P0 | V031-101 | done | Interface supports create/load/save/list/delete |
| V031-103 | M1 | Implement local JSON SessionStore | cli | P0 | V031-102 | done | CLI can read/write `sessions/<id>.json` safely inside workspace |
| V031-104 | M1 | Add Session list metadata | cli | P1 | V031-103 | done | list output includes id, title, createdAt, updatedAt, message count |
| V031-201 | M2 | Reuse existing Agent session across prompts | agent | P0 | V031-101 | done | Calling `agent.prompt()` twice keeps one session id and appends messages |
| V031-202 | M2 | Append user turn instead of recreating Session | agent | P0 | V031-201 | done | second prompt preserves first prompt context |
| V031-203 | M2 | Persist user-visible assistant answers | agent | P0 | V031-202 | done | direct and verified task answers become conversation messages |
| V031-204 | M2 | Keep internal phase JSON out of conversation history | context | P0 | V031-203 | done | route/plan/execute raw JSON is not persisted as assistant conversation |
| V031-205 | M2 | Add multi-turn tests for direct response path | agent | P0 | V031-203 | done | second direct response can reference first turn |
| V031-206 | M2 | Add multi-turn tests for tool/task path | agent | P0 | V031-203 | done | second task run sees earlier task final answer |
| V031-301 | M3 | Add `--session <id>` to one-shot CLI | cli | P0 | V031-103,V031-201 | done | command loads existing session, appends prompt, saves session |
| V031-302 | M3 | Save new one-shot sessions by default | cli | P0 | V031-103 | done | one-shot run writes a session file and prints/records session id |
| V031-303 | M3 | Add `rowan sessions list` | cli | P0 | V031-104 | done | lists persisted sessions from workspace |
| V031-304 | M3 | Add `rowan sessions show <id>` | cli | P0 | V031-103 | done | prints persisted session metadata/messages |
| V031-305 | M3 | Add `rowan sessions delete <id>` | cli | P1 | V031-103 | done | deletes a session file with path safety |
| V031-401 | M4 | Add `rowan chat` command | cli | P0 | V031-301 | done | starts interactive loop and persists after each turn |
| V031-402 | M4 | Add chat control commands | cli | P1 | V031-401 | done | `:exit`, `:quit`, and `:session` work |
| V031-403 | M4 | Add chat tests with mocked stdin/stdout | cli | P1 | V031-401 | done | chat mode can run two turns in one session |
| V031-501 | M5 | Include session id in trace metadata | trace | P0 | V031-201 | done | trace inspector can display session id for each trace |
| V031-502 | M5 | Preserve trace per session entry | trace | P0 | V031-301 | done | chat appends active turns to one trace; explicit session loads create new timestamped traces with the same session id |
| V031-503 | M5 | Add trace/session integration tests | trace | P1 | V031-501 | done | traces from explicit session entries map to the same session id |
| V031-601 | M6 | Update README/help text for session CLI | docs | P0 | V031-401 | done | help output documents chat and sessions commands |
| V031-602 | M6 | Run v0.3.1 release gates | release | P0 | V031-601 | done | `bun test packages` and `bun run build` pass |

## 3. Release Checklist

- [x] v0.3.1 docs created and linked
- [x] SessionStore interface tests
- [x] local JSON SessionStore tests
- [x] Agent multi-turn unit tests
- [x] CLI `--session` integration test
- [x] CLI `sessions list/show/delete` tests
- [x] CLI `chat` smoke test
- [x] trace/session id tests
- [x] `bun test packages`
- [x] `bun run build`

## 4. Explicitly Out of v0.3.1

- [ ] long-term memory
- [ ] vector retrieval
- [ ] automatic summarization
- [ ] trace replay/fork
- [ ] Web UI
- [ ] session migration framework
- [ ] cross-session search
