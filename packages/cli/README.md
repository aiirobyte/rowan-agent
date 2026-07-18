# @rowan-agent/cli

Command-line host for the durable Rowan Agent Runtime. It supports one-shot and
interactive input, Agent reconstruction, resource loading, and JSONL run logs.

## Setup

```bash
bun install
```

## Usage

```bash
# Create a durable Agent and submit one input
bun run rowan "what files are in this directory?"

# Reconstruct an Agent by its durable identity
bun run rowan --agent agt_12345678 "continue the previous topic"

# Discover Agent IDs, Session metadata, and active Run status
bun run rowan list

# Load skills or override the model
bun run rowan --skill code-review "review this code"
bun run rowan --model gpt-4o "use a different model"

# Inspect resolved config without secrets
bun run rowan config
```

## CLI Options

| Option | Description | Default |
|---|---|---|
| `--agent <id>` | Reconstruct an existing durable Agent | New Agent |
| `--skill <name>` | Load a skill; repeatable | — |
| `--log <path>` | Log path relative to `.rowan/` | Auto-generated |
| `--log-level <level>` | `debug`, `info`, `warn`, `error`, or `silent` | `info` |
| `--model <name>` | Model name | Config default |
| `--base-url <url>` | API base URL | `https://api.openai.com/v1` |
| `--api-key <key>` | API key | — |
| `--timeout-ms <ms>` | Streaming idle timeout | `60000` |
| `--help`, `-h` | Print help | — |

## Commands

| Command | Description |
|---|---|
| `rowan config` | Print resolved configuration as redacted JSON |
| `rowan list` | List durable Agents with Agent ID, Session ID, metadata, and active Run status |

When no command is given, positional arguments are joined as Agent Input.

## Interactive Controls

| Control | Action |
|---|---|
| `:session` | Print the bound Session ID |
| `:exit` / `:quit` | Exit and abort an active Agent Run |

The CLI prints Agent, Session, and Message IDs to stderr. When reconstructing an
Agent with a suspended Run, it also prints the persisted phase and input question.
Assistant output goes to stdout. Runtime State is stored at `.rowan/runtime.sqlite`, Sessions at
`.rowan/sessions/`, and logs at `.rowan/runs/`.

## Runtime Wiring

1. Resolve the workspace, model, and Agent resources.
2. Open the SQLite Runtime Store and start one `AgentRuntime`.
3. Call `runtime.createAgent()` or `runtime.reconstructAgent(agentId, options)`.
4. Submit input only through `agent.send()` and wait on `AgentRun.result()`.
5. Stream transient Agent Events to stdout/stderr and the JSONL logger.
6. Stop the Runtime and close the Store.

Resources are fixed for one live Agent Binding. A new CLI process reloads current
Skills, Phases, Extensions, Tools, prompt, and model before reconstruction.

## Configuration

The CLI owns `.rowan/config.yaml` loading, provider registration, default-model
selection, and workspace discovery. These are host concerns and are not exported
by `@rowan-agent/agent`.

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
`anthropic-messages`. String values support `${VAR}` interpolation; missing or
empty variables fail config loading. Without `--model`, selection order is the
top-level `model`, the first model marked `primary`, then the first configured
model.

The workspace defaults to the discovered project root and can be overridden by
`ROWAN_WORKSPACE`. Runtime data and configuration live under that workspace's
`.rowan/` directory.

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `ROWAN_LOG_LEVEL` | Run log detail | `info` |
| `ROWAN_WORKSPACE` | Workspace override | `cwd` |
