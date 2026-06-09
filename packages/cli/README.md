# @rowan-agent/cli

## Overview

`@rowan-agent/cli` provides the `rowan` command-line interface for running Rowan agents from the terminal. It supports one-shot prompts, interactive multi-turn sessions, session resume, skill loading, and run logging.

## Features

- **One-Shot Prompts** — run a single prompt and exit
- **Interactive Mode** — continue with stdin/TTY input after the initial prompt
- **Session Management** — resume previous sessions with `--session`
- **Skill System** — load custom skills with `--skill`
- **Run Logging** — automatic JSONL logs with configurable verbosity
- **Configuration** — inspect resolved config with `rowan config`

## Architecture

```
src/
├── cli.ts     # Command implementation, arg parsing, agent setup
├── output.ts  # JSON formatting for outcomes
└── index.ts   # Package entry point
```

### Composition

The CLI integrates these packages:

| Package | Role |
|---------|------|
| `@rowan-agent/models` | Model configuration and streaming |
| `@rowan-agent/agent` | Core agent runtime |
| `@rowan-agent/logging` | Event logging (file + stderr) |

## Setup

```bash
# From the repository root
bun install

# Configure environment
cp .env.example .env
# Set ROWAN_OPENAI_API_KEY and ROWAN_MODEL in .env
```

## Usage

### One-Shot Prompt

```bash
bun run rowan "what files are in this directory?"
```

### Interactive Session

```bash
bun run rowan "hello"
# Continues reading from stdin after initial response
```

### Resume a Session

```bash
bun run rowan --session ses_12345678 "continue the previous topic"
```

### Load a Skill

```bash
bun run rowan --skill example "summarize what this skill does"
```

### Inspect Configuration

```bash
bun run rowan config
```

### List Saved Sessions

```bash
bun run rowan list
```

### Debug Logging

```bash
bun run rowan --log-level debug "show me all the details"
```

## CLI Options

| Option | Description |
|--------|-------------|
| `--session <id>` | Resume a previous session |
| `--skill <id>` | Load a skill from `<workspace>/skills/<id>/SKILL.md` |
| `--log <path>` | Custom log file path (relative to workspace) |
| `--log-level <level>` | Set verbosity: `debug`, `info`, `warn`, `error`, `silent` |

## Commands

| Command | Description |
|---------|-------------|
| `rowan config` | Print resolved configuration (redacted) |
| `rowan list` | List saved session metadata |

## Interactive Controls

| Control | Action |
|---------|--------|
| `:session` | Show current session ID |
| `:exit` | Exit the CLI |
| `:quit` | Exit the CLI |

## Output Behavior

- **stdout** — reserved for final command results (JSON)
- **stderr** — runtime events and metadata
- **Logs** — JSONL files under `<workspace>/runs/`

## Version

Current version: **0.4.4**
