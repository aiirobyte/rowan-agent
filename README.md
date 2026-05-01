# Rowan Agent

Rowan v0 is a minimal TypeScript + Bun agent kernel.

```bash
bun install
bun test
bun run build
```

For v0.1 model runtime:

```bash
cp .env.example .env
# Fill ROWAN_OPENAI_API_KEY and ROWAN_MODEL in .env

bun run rowan "hello"
bun run rowan --skill example "summarize the example skill"
bun run rowan --trace runs/real.jsonl "list workspace files"
```

Rowan resolves one workspace root per runtime:

- Source/dev runs use this project root as the workspace.
- Packaged binary runs use `~/.rowan` as the workspace.

Every CLI run writes a JSONL trace automatically under `<workspace>/runs/` with a local-time file name like `2026-03-12T164018-22+08:00-run_12345678.jsonl`.
Skills live under `<workspace>/skills/`, so `--skill example` reads `<workspace>/skills/example/SKILL.md`.
Use `--trace <path>` only when you want to choose the exact file path relative to the workspace.

See [docs/INDEX.md](docs/INDEX.md) for the plan.
