# Issue slices: Run Interaction and durable Phase entry

Status: Implemented locally for v0.13.0. Do not publish to GitHub without a
separate request.

Source: [PRD-0010](../prd/0010-run-interaction-and-durable-phase-entry.md)

Decision: [ADR-0012](../adr/0012-run-interaction-and-durable-phase-entry.md)

## Requirements

| Requirement | Commit | Verification |
| --- | --- | --- |
| R1 Rename interactions | `3b5b7ad` | Public exports use Run Interaction names |
| R2 Final states and reply path | `5713840` | Interaction state and legacy upgrade coverage |
| R3 Records and model projection | `c174456` | Templates, defaults, Tool result folding |
| R4 Tool execute suspension | `fae6801` | Tool re-entry, checkpoint, answers, cancellation |
| R5 Durable Phase entry | `e701b4c` | a → b → a event order; SQLite snapshot recovery |
| Docs and version | pending | `bun run build`; `bun run test` (349 tests) |

## Acceptance

One commit per requirement, followed by a docs/version commit. Full workspace
build and tests pass. No publish, tag, or push.
