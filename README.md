# Rowan Agent

> A minimal TypeScript + Bun agent harness runtime for productized **Loop Engineering**.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Runtime-Bun-fbf0df.svg)](https://bun.sh/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Loop Engineering** means designing the control loop around agents: goals, context, tools, verification, and durable memory are encoded in the system so agent work can iterate until a concrete Outcome is reached.

**Rowan Agent** provides a configurable phase-based execution loop with LLM-driven routing, session persistence, skills, tool execution, streaming model integration, structured events, and an extension system for plugins.

---

## Architecture

```
rowan-agent/
├── packages/
│   ├── models/    # Model registry, providers, cost calculation, SSE streaming
│   ├── agent/     # Core runtime: phase loop, extensions, session, tools, skills
│   ├── logging/   # Event logging: console JSONL + Pino file output
│   └── cli/       # Command-line interface
└── package.json
```

```
@rowan-agent/cli
    ├── @rowan-agent/agent
    │       └── @rowan-agent/models
    ├── @rowan-agent/models
    └── @rowan-agent/logging
            └── @rowan-agent/models
```

### Execution Flow

```
┌─────────────────────────────────────────────────────────┐
│                      User Input                          │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│  Phase Loop                                              │
│  • Inject phase instructions (PHASE.md)                  │
│  • Execute phase (factory / run / LLM fallback)          │
│  • LLM calls route tool → continue, stop, or next phase  │
│  • Supports parallel fork/join for multiple targets      │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│  Outcome — terminal result with message and tool results │
└─────────────────────────────────────────────────────────┘
```

When no phases are defined, a `"default"` phase lets the LLM drive execution and routing directly.

---

## Quick Start

```bash
git clone https://github.com/your-org/rowan-agent.git
cd rowan-agent
bun install
```

```bash
cp .env.example .env
# Set ROWAN_OPENAI_API_KEY and ROWAN_MODEL in .env
```

```bash
bun run rowan "list the files in this directory"
```

---

## Usage

### CLI

```bash
bun run rowan "explain the architecture of this project"
bun run rowan --session ses_12345678 "continue where we left off"
bun run rowan --skill example "summarize what this skill does"
bun run rowan --log-level debug "show all the details"
bun run rowan --model gpt-4o "use a different model"
bun run rowan config
bun run rowan list
```

### Programmatic API

```ts
import { Agent, createMessage, createCoreTools } from "@rowan-agent/agent";
import { resolveModel } from "@rowan-agent/models";

const agent = new Agent({
  context: {
    systemPrompt: "You are a helpful coding assistant.",
    messages: [createMessage("user", "summarize this codebase")],
    tools: createCoreTools({ root: process.cwd() }),
    skills: [],
  },
  model: resolveModel("openai/gpt-4.1-mini"),
  stream,
});

agent.subscribe((event) => console.log(`[${event.type}]`, event));

const result = await agent.run();
console.log(result.outcome?.message);
```

### Streaming

```ts
import { resolveOpenAICompletionsConfig, createOpenAICompletionsStream } from "@rowan-agent/models/providers";

const config = resolveOpenAICompletionsConfig();
const stream = createOpenAICompletionsStream(config);
const agent = new Agent({ stream, model, context });
```

### Logging

```ts
import { pinoAgentEventLogger } from "@rowan-agent/logging";

const logger = pinoAgentEventLogger("runs/session.jsonl", { level: "info" });
agent.subscribe(logger);
await agent.run();
await logger.flush();
```

### Skills

Create a skill at `<workspace>/.rowan/skills/my-skill/SKILL.md`:

```markdown
# My Custom Skill

You are a specialized assistant for [task].

## Instructions

1. Analyze the input
2. Apply domain-specific logic
3. Return structured results
```

```bash
bun run rowan --skill my-skill "perform the specialized task"
```

### Plugin Extensions

Plugins are discovered from `<workspace>/.rowan/extensions` and receive an `ExtensionAPI` to register hooks, tools, phases, model providers, and events.

```ts
import type { ExtensionAPI } from "@rowan-agent/agent";

export default function myPlugin(rowan: ExtensionAPI) {
  rowan.on("agent_start", (event) => { ... });
  rowan.registerTool({ name: "my_tool", description: "...", parameters: {...}, execute: async (args) => {...} });
  rowan.registerPhase({ id: "review", description: "...", run: async (ctx) => {...} });
}
```

> **Full reference:** [Extensions Documentation](packages/agent/docs/extensions.md)

---

## Packages

| Package | Version | Description |
|---------|---------|-------------|
| [@rowan-agent/models](packages/models) | 0.4.6 | Model registry, providers, cost calculation, SSE streaming |
| [@rowan-agent/agent](packages/agent) | 0.4.6 | Core runtime: phase loop, extensions, session, tools, skills |
| [@rowan-agent/logging](packages/logging) | 0.4.6 | Event logging with secret redaction |
| [@rowan-agent/cli](packages/cli) | 0.4.6 | Command-line interface |

## Documentation

| Doc | Description |
|-----|-------------|
| [Phases](packages/agent/docs/phases.md) | Phase lifecycle, PHASE.md format, parallel execution, routing, payload |
| [Extensions](packages/agent/docs/extensions.md) | Extension API, hooks, custom tools/phases, model providers, event bus |

---

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `ROWAN_OPENAI_API_KEY` | Yes | API key for OpenAI-compatible endpoint |
| `ROWAN_MODEL` | Yes | Model name (e.g. `gpt-4.1-mini`) |
| `ROWAN_OPENAI_BASE_URL` | No | Custom API endpoint |
| `ROWAN_OPENAI_TIMEOUT_MS` | No | Request timeout in ms (default: 60000) |
| `ROWAN_LOG_LEVEL` | No | Log level (`debug`, `info`, `warn`, `error`, `silent`) |
| `ROWAN_RUNTIME` | No | Runtime override (`source` or `binary`) |
| `ROWAN_WORKSPACE` | No | Override current working directory |

**Workspace resolution:** dev mode uses project root; packaged binary uses `~/.rowan`.

| Path | Description |
|------|-------------|
| `<workspace>/.rowan/runs/` | JSONL run logs |
| `<workspace>/.rowan/sessions/` | Persisted session data |
| `<workspace>/.rowan/skills/` | Custom skill definitions |
| `<workspace>/.rowan/extensions/` | Plugin extension modules |

---

## Development

```bash
bun run build           # Type check all packages
bun run build:packages  # Build distributable packages
bun test                # Run all tests
bun test packages/agent # Run tests for a specific package
```

---

## Acknowledgements

Inspired by [pi-agent-core](https://github.com/badlogic/pi-mono) and [Cahciua](https://github.com/Menci/Cahciua).

## License

MIT
