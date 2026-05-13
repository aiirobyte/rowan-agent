# Rowan Current Spec

Last updated: 2026-05-13

This file is the current planning entry point. Specific version plans now live under `docs/version/<semver>/`.

Project-level references:

- `CONTEXT.md`: Rowan domain language.
- `docs/adr/`: accepted architecture decisions.
- `docs/architecture/module-map.md`: current package/module map.
- `docs/architecture/deepening-opportunities.md`: architecture review candidates.
- `docs/PLAN/`: legacy release planning tree through the v0.4.3 planning draft.

## Active Version

Active version: `0.4.3` planning

- Previous implemented baseline: `0.4.2`
- Active version docs: `docs/version/0.4.3/`
- Legacy draft source: `docs/PLAN/v0.4.3/`

## Product Intent

Rowan is an engineering-agent harness runtime. It standardizes task planning, model/tool execution, verification, run logging, session state, and later replay/eval/workflow capabilities behind clean package boundaries.

The current architecture direction is to keep `agent` as the execution kernel and loop owner while neighboring packages own their specific boundaries:

- `protocol`: shared runtime contracts.
- `adapters`: provider and model wire-format normalization.
- `runtime`: tools, skills, hooks, MCP, workspace helpers, and plugin/policy glue.
- `context`: prompt construction and phase-readable context rendering.
- `store`: persistence.
- `logging`: run-log output.

## Boundary Rule

If a change would make `agent` own provider wire-format repair, tool runtime integration, persistence plumbing, or outer workflow orchestration, first check whether the responsibility belongs in `adapters`, `runtime`, `store`, `context`, or a composition layer.

`agent` should retain session lifecycle, Agent events, run ordering, task/thread semantics, attempts, verification, and `AgentRunResult` assembly.

## Version Index

- `0.0.0`: Minimal Agent Kernel. Complete.
- `0.1.0`: Real Model Runtime. Complete.
- `0.2.0`: Monorepo And Workspace Foundation. Complete.
- `0.3.0`: Route-first Thread Predecessor. Complete.
- `0.3.1`: Persistent Session And Multi-turn CLI. Complete.
- `0.3.2`: Threaded Agent Sessions. Complete.
- `0.3.3`: Storage Port And Scoped Context. Complete.
- `0.3.4`: Store Package Consolidation. Complete.
- `0.3.5`: Pino Runtime Logging. Complete.
- `0.4.0`: Protocol Boundary And Runtime Split. Complete.
- `0.4.1`: Agent Boundary Correction. Complete.
- `0.4.2`: Agent Loop IO Atomization. Complete.
- `0.4.3`: Agent Loop Package Boundary Consolidation. Planned.
- `0.5.0`: Context Projection And Provider IR. Planned.
- `0.6.0`: Tool Runtime Policy Ports. Planned.
- `0.7.0`: Replay, Fork, And Compaction. Planned.
- `0.8.0`: Eval Harness. Planned.
- `0.9.0`: Workflow Orchestration. Planned.
- `1.0.0`: Modular Harness Runtime. Planned.
