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

See [docs/INDEX.md](docs/INDEX.md) for the plan.
