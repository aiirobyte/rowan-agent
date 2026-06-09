# Rowan Agent

> A minimal TypeScript + Bun Agent harness runtime for productized **Loop Engineering**.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Runtime-Bun-fbf0df.svg)](https://bun.sh/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Loop Engineering](https://img.shields.io/badge/Pattern-Loop%20Engineering-green.svg)](#loop-engineering-in-rowan)

**Loop Engineering** means designing the control loop around agents: goals, context, tools, verification, and durable memory are encoded in the system so agent work can iterate until a concrete Outcome is reached.

**Rowan Agent** is a productized implementation of that idea for engineering workflows. It provides an Agent facade, a route -> plan -> execute -> verify Agent loop, Session persistence, skills, tool execution, streaming model integration, structured AgentEvents/run logs, and an extension system for plugin-provided hooks, tools, phases, and model providers.

---

## Loop Engineering In Rowan

| Capability | What Rowan provides |
|------------|---------------------|
| **Agent Loop** | Built-in route -> plan -> execute -> verify state machine that produces an Outcome |
| **Session Persistence** | Durable conversation state for continuing work across CLI entries |
| **Skills** | `SKILL.md` bundles loaded into Session context |
| **Tool Execution** | Core read/write/edit/bash tooling available during execution |
| **Extension System** | `.rowan/extensions` plugins can register hooks, tools, phases, and model providers |
| **Event Streaming** | Observable AgentEvents for CLI output and subscribers |
| **Structured Run Logs** | Pino JSONL logs for debugging and inspection |
| **Model Providers** | OpenAI-compatible streaming model adapter and registry |
| **TypeScript-First** | Typed messages, tools, phase outputs, and events |

---

## Architecture

```
rowan-agent/
├── packages/
│   ├── models/    # Model registry, providers, cost calculation
│   ├── agent/     # Core agent runtime with phase loop and extension system
│   ├── logging/   # Event logging (console + Pino file)
│   └── cli/       # Command-line interface
└── docs/          # Documentation and version plans
```

### Execution Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Input                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Route Phase                                                    │
│  • Classify intent                                              │
│  • Select tools / skills                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Plan Phase                                                     │
│  • Generate task breakdown                                      │
│  • Estimate steps                                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Execute Phase                                                  │
│  • Call tools (read, write, edit, bash)                         │
│  • Stream model responses                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Verify Phase                                                   │
│  • Check results                                                │
│  • Loop or complete                                             │
└─────────────────────────────────────────────────────────────────┘
```

### Package Dependencies

```
@rowan-agent/cli
    ├── @rowan-agent/agent
    ├── @rowan-agent/models
    └── @rowan-agent/logging
            └── @rowan-agent/models
```

---

## Quick Start

### 1. Install Dependencies

```bash
git clone https://github.com/your-org/rowan-agent.git
cd rowan-agent
bun install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your API credentials:

```env
ROWAN_OPENAI_API_KEY=sk-your-api-key
ROWAN_MODEL=gpt-4.1-mini
# Optional: ROWAN_OPENAI_BASE_URL=https://your-api-endpoint.com
```

### 3. Run Your First Prompt

```bash
bun run rowan "list the files in this directory"
```

---

## Usage Examples

### CLI Commands

```bash
# One-shot prompt
bun run rowan "explain the architecture of this project"

# Resume a session
bun run rowan --session ses_12345678 "continue where we left off"

# Load a skill
bun run rowan --skill example "summarize what this skill does"

# Debug mode with full event payloads
bun run rowan --log-level debug "show all the details"

# Inspect configuration (secrets redacted)
bun run rowan config

# List saved sessions
bun run rowan list
```

### Programmatic API

#### Create and Run an Agent

```ts
import { Agent, createMessage } from "@rowan-agent/agent";
import { createCoreTools } from "@rowan-agent/runtime";
import { resolveModel } from "@rowan-agent/models";

const tools = createCoreTools({ root: process.cwd() });
const model = resolveModel("openai/gpt-4.1-mini");

const agent = new Agent({
  context: {
    systemPrompt: "You are a helpful coding assistant.",
    messages: [createMessage("user", "summarize this codebase")],
    tools,
  },
  model,
  stream,
});

// Subscribe to events
agent.subscribe((event) => {
  console.log(`[${event.type}]`, event.data);
});

// Run and get result
const result = await agent.run();
console.log(result.outcome.message);
```

#### Stream Model Responses

```ts
import { createOpenAICompatibleStream, resolveOpenAICompatibleConfig } from "@rowan-agent/models/providers";

const config = resolveOpenAICompatibleConfig({ tools });
const stream = createOpenAICompatibleStream(config);

// Pass stream to Agent constructor
const agent = new Agent({ stream, /* ... */ });
```

#### Log Agent Runs

```ts
import { pinoAgentEventLogger } from "@rowan-agent/logging";

const logger = pinoAgentEventLogger("runs/session.jsonl", {
  level: "info",
});

agent.subscribe(logger);
await agent.run();
await logger.flush();
```

### Custom Skills

Create a skill file at `<workspace>/skills/my-skill/SKILL.md`:

```markdown
# My Custom Skill

You are a specialized assistant for [task].

## Instructions

1. Analyze the input
2. Apply domain-specific logic
3. Return structured results
```

Use it:

```bash
bun run rowan --skill my-skill "perform the specialized task"
```

### Plugin Extensions

Plugins are Rowan extension modules discovered from `<workspace>/.rowan/extensions`. They receive an `ExtensionAPI` and can register lifecycle hooks, LLM-callable tools, custom phases, model providers, and cross-plugin events.

Create a plugin directory:

```text
<workspace>/.rowan/extensions/docs-search/
├── package.json
└── index.ts
```

Declare the extension entry in `package.json`:

```json
{
  "name": "docs-search",
  "rowan": {
    "extensions": ["./index.ts"]
  }
}
```

Register capabilities from `index.ts`:

```ts
import type { ExtensionAPI } from "@rowan-agent/agent";

export default function docsSearchPlugin(rowan: ExtensionAPI) {
  rowan.on("agent_start", (event) => {
    rowan.events.emit("docs-search:ready", {
      sessionId: event.sessionId
    });
  });

  rowan.registerTool({
    name: "search_docs",
    description: "Search project documentation",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" }
      },
      required: ["query"]
    },
    execute: async (args) => {
      const query = (args as { query: string }).query;
      return {
        content: [{ type: "text", text: `Search results for: ${query}` }]
      };
    }
  });
}
```

When an `Agent` runs without a custom `phaseConfig`, Rowan builds the default phase registry from built-in phases plus the plugins under `.rowan/extensions`.

---

## Packages

| Package | Version | Description |
|---------|---------|-------------|
| [@rowan-agent/models](packages/models) | 0.4.6 | Model registry, providers, cost calculation |
| [@rowan-agent/agent](packages/agent) | 0.4.6 | Core agent runtime with phase loop |
| [@rowan-agent/logging](packages/logging) | 0.4.4 | Event logging with Pino |
| [@rowan-agent/cli](packages/cli) | 0.4.4 | Command-line interface |

---

## Development

### Build

```bash
# Type check all packages
bun run build

# Build distributable packages
bun run build:packages
```

### Test

```bash
# Run all tests
bun test

# Run tests for a specific package
bun test packages/agent
```

### Project Structure

```
rowan-agent/
├── packages/
│   ├── models/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── models.ts           # Model registry
│   │   │   ├── protocol.ts         # Type definitions
│   │   │   ├── providers/          # Provider implementations
│   │   │   └── sse.ts              # SSE stream parser
│   │   └── package.json
│   ├── agent/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── agent.ts            # Agent facade
│   │   │   ├── agent-loop.ts       # Loop runner
│   │   │   └── loop/               # Phase definitions
│   │   └── package.json
│   ├── logging/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── record.ts           # Event mapping
│   │   │   ├── redact.ts           # Secret redaction
│   │   │   ├── console.ts          # Console logger
│   │   │   └── pino.ts             # File logger
│   │   └── package.json
│   └── cli/
│       ├── src/
│       │   ├── cli.ts              # CLI implementation
│       │   └── output.ts           # JSON formatting
│       └── package.json
├── docs/                            # Documentation
├── scripts/                         # Build scripts
├── .env.example
└── package.json
```

---

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ROWAN_OPENAI_API_KEY` | Yes | API key for OpenAI-compatible endpoint |
| `ROWAN_MODEL` | Yes | Model name (e.g., `gpt-4.1-mini`) |
| `ROWAN_OPENAI_BASE_URL` | No | Custom API endpoint |
| `ROWAN_LOG_LEVEL` | No | Log level (`debug`, `info`, `warn`, `error`, `silent`) |

### Workspace Resolution

- **Development** — project root is the workspace
- **Packaged binary** — `~/.rowan` is the workspace

### File Locations

| Path | Description |
|------|-------------|
| `<workspace>/runs/` | JSONL run logs |
| `<workspace>/sessions/` | Persisted session data |
| `<workspace>/skills/` | Custom skill definitions |
| `<workspace>/.rowan/extensions/` | Plugin extension modules |

---

## Interactive Controls

When using the CLI interactively:

| Control | Action |
|---------|--------|
| `:session` | Display current session ID |
| `:exit` | Exit the CLI |
| `:quit` | Exit the CLI |

---

## Acknowledgements

The development of this project was greatly inspired by:

- [pi-agent-core](https://github.com/badlogic/pi-mono) — minimal agent runtime design
- [Cahciua](https://github.com/Menci/Cahciua) — TypeScript agent patterns

Sincere thanks for their excellent work!

---

## License

MIT
