# @rowan-agent/cli

## Main Features

`@rowan-agent/cli` provides the `rowan` command-line entry point for running a Rowan agent from the terminal. It supports one-shot prompts, interactive multi-turn input, session resume, skill loading, configuration inspection, session listing, run logs, and model option overrides.

CLI stdout is reserved for final command results. Runtime events are written to Pino JSONL logs and mirrored to stderr, which keeps script-friendly output clean.

## Architecture

`src/cli.ts` contains the full command implementation. It handles argument parsing, workspace resolution, model adapter configuration, session storage, logger subscriptions, Agent creation, and interactive input.

`src/output.ts` formats Outcomes and plain objects as JSON text.

`src/skills.ts` re-exports runtime skill loading helpers so the CLI can resolve either `<workspace>/skills/<id>/SKILL.md` or explicit skill paths with one rule set.

The CLI composes these packages:

- `@rowan-agent/adapters` creates the OpenAI-compatible `stream`.
- `@rowan-agent/agent` creates the agent and core tools.
- `@rowan-agent/runtime` resolves workspace, runs, sessions, and skills paths.
- `@rowan-agent/logging` writes console and file logs.
- `@rowan-agent/store` persists session JSON.

## Usage Flow

1. Install dependencies from the repository root with `bun install`.
2. Prepare `.env` with at least `ROWAN_OPENAI_API_KEY` and `ROWAN_MODEL`.
3. Run a one-shot prompt with `bun run rowan "hello"`.
4. Use `bun run rowan config` to inspect redacted configuration, and `bun run rowan list` to list saved sessions.
5. Use `--session <session-id>` to resume a session, `--skill <id>` to load a skill, and `--log-level debug` to include full redacted events.

```bash
bun run rowan "use bash to inspect the current directory"
bun run rowan --session ses_12345678 "continue the previous topic"
bun run rowan --skill example "summarize what this skill does"
```
