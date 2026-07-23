# @rowan-agent/cli

Command-line host for the Durable Rowan Agent Runtime. It supports one-shot
input, interactive input, Run recovery, resource loading, and JSONL Durable Run
Event logging.

## Usage

```bash
bun run rowan "what files are in this directory?"
bun run rowan --agent agt_12345678 "continue the previous topic"
bun run rowan list
bun run rowan --skill code-review "review this code"
bun run rowan config
```

## Options

| Option | Description | Default |
|---|---|---|
| `--agent <id>` | Use an existing Agent identity | New Agent |
| `--skill <name>` | Load a Skill; repeatable | — |
| `--log <path>` | Log path relative to `.rowan/` | Auto-generated |
| `--log-level <level>` | `debug`, `info`, `warn`, `error`, or `silent` | `info` |
| `--model <name>` | Model name | Config default |
| `--base-url <url>` | API base URL | `https://api.openai.com/v1` |
| `--api-key <key>` | API key | — |
| `--timeout-ms <ms>` | Streaming idle timeout | `60000` |

## Commands and controls

- `rowan config`: print redacted configuration.
- `rowan list`: list Durable Agent and Run states.
- `:exit` / `:quit`: exit and cancel the current Run.

Runtime data is stored in `.rowan/runtime.sqlite`; Run logs are stored in
`.rowan/runs/`. Log files use the `<timestamp>-<run-id>.jsonl` format.

The CLI manages lifecycle through `AgentRuntime.init()`, `createAgent()`,
`start()`, and `run()`. It does not create Sessions or process-local Agent
objects.

## Configuration

```yaml
model:
  provider: openai
  id: gpt-4o
logLevel: info
providers:
  - id: openai
    baseUrl: https://api.openai.com/v1
    apiKey: ${OPENAI_API_KEY}
    protocol: openai-responses
    models:
      - id: gpt-4o
        primary: true
```

Supported protocols are `openai-completions`, `openai-responses`, and
`anthropic-messages`.

## Environment variables

| Variable | Description | Default |
|---|---|---|
| `ROWAN_LOG_LEVEL` | Run log level | `info` |
| `ROWAN_WORKSPACE` | Workspace override | `cwd` |
