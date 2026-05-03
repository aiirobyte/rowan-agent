# Rowan v0.3.5 Task Board

> 版本：v0.3.5
> 日期：2026-05-03
> 状态：implemented

## 1. Milestones

| Milestone | Goal |
|---|---|
| M0 | Planning |
| M1 | Logging package scaffold |
| M2 | Pino event logger |
| M3 | CLI rewiring |
| M4 | Trace package removal |
| M5 | Boundary and release verification |

## 2. Tasks

| ID | Milestone | Task | Type | Priority | Depends On | Status | Acceptance |
|---|---|---|---|---|---|---|---|
| V035-001 | M0 | Add v0.3.5 planning docs | docs | P0 | - | done | `PLAN.md`, `TASKS.md`, `README.md` exist and roadmap links to v0.3.5 |
| V035-101 | M1 | Create `packages/logging` | package | P0 | V035-001 | done | Package exports public logging API and declares `pino` dependency |
| V035-201 | M2 | Move redaction into logging | logging | P0 | V035-101 | done | API key redaction tests pass |
| V035-202 | M2 | Implement Pino AgentEvent logger | logging/test | P0 | V035-201 | done | Logger writes Pino JSONL records containing `event` payload and supports flush |
| V035-301 | M3 | Replace CLI trace writer with logger | cli/logging | P0 | V035-202 | done | CLI subscribes `pinoAgentEventLogger` and prints `Log written to ...` |
| V035-302 | M3 | Replace `--trace` with `--log` | cli/test | P0 | V035-301 | done | CLI accepts `--log`, rejects removed `--trace`, and config outputs `logging` |
| V035-401 | M4 | Remove `packages/trace` | package | P0 | V035-302 | done | No source imports `@rowan-agent/trace` |
| V035-402 | M4 | Update tests that inspect run log files | test | P0 | V035-401 | done | Tests parse Pino records and assert event payloads |
| V035-501 | M5 | Update package boundaries | test | P0 | V035-401 | done | Boundary rules include `logging` and exclude `trace` |
| V035-502 | M5 | Run release gates | release | P0 | V035-501 | done | `bun test packages` and `bun run build` pass |

## 3. Release Checklist

- [x] `packages/logging` exists
- [x] logging package exports `pinoAgentEventLogger`
- [x] logging package exports `redactSecrets`
- [x] CLI imports logging instead of trace
- [x] CLI supports `--log`
- [x] CLI rejects `--trace`
- [x] `packages/trace` removed
- [x] package boundary test updated
- [x] run log records contain original `AgentEvent` payload
- [x] `bun test packages`
- [x] `bun run build`

## 4. Explicitly Out of v0.3.5

- [ ] trace replay / fork
- [ ] log inspect command
- [ ] OpenTelemetry integration
- [ ] session schema change
- [ ] DB / SQLite
