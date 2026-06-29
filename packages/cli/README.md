# @rowan-agent/cli

Command-line interface for Rowan Agent. Supports one-shot prompts, interactive multi-turn sessions, session management, skill loading, extension discovery, and JSONL run logging.

## Setup

```bash
bun install
```

## Usage

```bash
# One-shot prompt
bun run rowan "what files are in this directory?"

# Interactive session (continues on stdin, :exit to quit)
bun run rowan "hello"

# Resume a session
bun run rowan --session ses_12345678 "continue the previous topic"

# Load skills
bun run rowan --skill code-review --skill test-gen "review and test this code"

# Override model
bun run rowan --model gpt-4o "use a different model"

# Debug logging
bun run rowan --log-level debug "show full event payloads"

# Inspect resolved config (secrets redacted)
bun run rowan config

# List saved sessions
bun run rowan list
```

## CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `--session <id>` | Resume a previous session | — |
| `--skill <name>` | Load a skill (repeatable) | — |
| `--log <path>` | Custom log file path (relative to `.rowan/`) | Auto-generated |
| `--log-level <level>` | `debug`, `info`, `warn`, `error`, `silent`; can also be set with `ROWAN_LOG_LEVEL` | `info` |
| `--model <name>` | Model name | — |
| `--base-url <url>` | API base URL | `https://api.openai.com/v1` |
| `--api-key <key>` | API key | — |
| `--timeout-ms <ms>` | Request timeout in milliseconds | `60000` |
| `--help`, `-h` | Print help and exit | — |

## Commands

| Command | Description |
|---------|-------------|
| `rowan config` | Print resolved configuration as JSON (secrets redacted) |
| `rowan list` | List all saved sessions |

When no command is given, positional arguments are joined as the prompt.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ROWAN_LOG_LEVEL` | Run log detail level | `info` |
| `ROWAN_RUNTIME` | Runtime override (`source` or `binary`) | Auto-detected |
| `ROWAN_WORKSPACE` | Override current working directory | `cwd` |

## Interactive Controls

| Control | Action |
|---------|--------|
| `:session` | Print current session ID |
| `:exit` / `:quit` | Exit the CLI |

## Output Behavior

- **stdout** — assistant text (streamed as it arrives), `config`/`list` JSON output, `:session` ID
- **stderr** — session/message IDs, log path, tool execution status, loop metrics, errors

Tool execution is shown on stderr: `⚙ read { path: "..." }` when started, `✓ read` / `✗ bash` when completed.

## Run Logs & Sessions

- Logs auto-generated at `.rowan/runs/<timestamp>-<session-id>.jsonl`
- Sessions saved to `.rowan/sessions/<session-id>.jsonl`
- `--log` overrides log path; `--session` resumes a session; `rowan list` lists all sessions

## How It Wires Together

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│  models   │◄────│   cli    │────►│  logging │
│ (stream)  │     │ (wiring) │     │ (JSONL)  │
└──────────┘     └────┬─────┘     └──────────┘
                      │
                      ▼
                ┌──────────┐
                │   agent   │
                │  (loop)   │
                └──────────┘
```

1. Parse args → resolve workspace, load skills, create core tools
2. Optionally resume session via `LocalJsonlSessionManager`
3. Discover and load extensions from `.rowan/extensions`
4. Create `Agent` with OpenAI completions stream
5. Stream assistant text to stdout, tool status to stderr
6. Write JSONL run logs via `pinoAgentEventLogger`
7. In interactive mode, loop on stdin input

## Output Formatting (Programmatic)

```ts
import {
  formatJsonOutput,
  formatToolArgsPreview,
  formatToolResultOutput,
  formatMessageContent,
  formatOutcomeOutput,
} from "@rowan-agent/cli";
```

## Version

Current version: **0.4.6**
