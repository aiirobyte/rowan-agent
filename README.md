# Rowan Agent

Rowan v0 is a minimal TypeScript + Bun agent kernel.

```bash
bun install
bun test
bun run build
bun run rowan --fake "hello"
bun run rowan --fake "use echo tool"
bun run rowan --fake --trace .rowan/runs/latest.jsonl "use echo tool"
```

For v0.1 OpenAI-compatible runtime:

```bash
cp .env.example .env
# Fill ROWAN_OPENAI_API_KEY and ROWAN_MODEL in .env

bun run rowan --openai-compatible "hello"
bun run rowan --openai-compatible --trace .rowan/runs/real.jsonl "use echo tool"
```

See [docs/v0/PLAN.md](docs/v0/PLAN.md) for the v0 plan.
