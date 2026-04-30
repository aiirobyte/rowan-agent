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
bun run rowan --trace .rowan/runs/real.jsonl "use echo tool"
```

Every CLI run writes a JSONL trace automatically under `.rowan/runs/` with a local-time file name like `2026-03-12T164018-22+08:00-run_12345678.jsonl`.
Use `--trace <path>` only when you want to choose the exact file path.

See [docs/INDEX.md](docs/INDEX.md) for the plan.
