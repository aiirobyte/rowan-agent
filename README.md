# Rowan Agent

Rowan is a minimal TypeScript + Bun agent kernel.

```bash
bun install
bun test
bun run build
```

For the CLI model runtime:

```bash
cp .env.example .env
# Fill ROWAN_OPENAI_API_KEY and ROWAN_MODEL in .env

bun run rowan "hello"
bun run rowan config
bun run rowan list
bun run rowan --session <session-id> "continue"
bun run rowan --skill example "summarize the example skill"
bun run rowan --trace runs/real.jsonl "use bash to list workspace files"
```

Rowan resolves one workspace root per runtime:

- Source/dev runs use this project root as the workspace.
- Packaged binary runs use `~/.rowan` as the workspace.

Every CLI session entry writes a JSONL trace automatically under `<workspace>/runs/` with a local-time file name like `2026-03-12T164018-22+08:00-ses_12345678.jsonl`; turns in the same process append to that trace.
Sessions are saved automatically under `<workspace>/sessions/`; use `--session <id>` to continue one.
`bun run rowan [options] [command] [prompt]` is the single CLI entrypoint. Without a command, positional text is the prompt: Rowan runs it first and then continues reading interactive turns from stdin/TTY. The `config` command prints the resolved configuration without exposing secrets, and `list` prints saved session metadata without message content. Controls are `:session`, `:exit`, and `:quit`.
The CLI reports the Session id once per CLI entry, prints the current Message id before each turn result, and prints the trace path as the last metadata line once per CLI entry.
Skills live under `<workspace>/skills/`, so `--skill example` reads `<workspace>/skills/example/SKILL.md`.
Use `--trace <path>` only when you want to choose the exact file path relative to the workspace.
The built-in core tools are `read`, `write`, `edit`, and `bash`.

See [docs/PLAN/INDEX.md](docs/PLAN/INDEX.md) for the plan.
