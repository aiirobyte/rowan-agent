# @rowan-agent/agent

## Overview

`@rowan-agent/agent` is the core agent runtime for Rowan. It provides the public `Agent` facade and implements a configurable phase-based execution loop with route → plan → execute → verify semantics.

## Features

- **Phase-Based Loop** — configurable execution phases (route, plan, execute, verify)
- **Event Streaming** — subscribe to typed agent events for logging and UI integration
- **Tool Registration** — register and execute tools within the agent loop
- **Session Support** — resume conversations with session IDs
- **Cancellation** — abort running agent tasks gracefully
- **Custom Phases** — extend or replace built-in phases with custom definitions

## Architecture

```
src/
├── index.ts           # Package entry point
├── agent.ts           # Agent class — public facade
├── agent-loop.ts      # Loop runner with phase iteration
├── event-stream.ts    # Event subscription and emission
├── types.ts           # Public types: AgentState, AgentRunResult, etc.
├── utils.ts           # Internal helpers
└── loop/              # Phase definitions and runners
    ├── phase-config.ts     # Phase configuration types and validation
    ├── built-in-phases.ts  # Default route/plan/execute/verify phases
    ├── phases.ts           # Base phase runners
    └── routing.ts          # Route scheduling helper
```

### Execution Flow

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│  Route   │───▶│  Plan   │───▶│ Execute │───▶│ Verify  │
└─────────┘    └─────────┘    └─────────┘    └─────────┘
     │                                            │
     └────────────────────────────────────────────┘
                   (loop on failure)
```

## Installation

```bash
npm install @rowan-agent/agent
# or
bun add @rowan-agent/agent
```

## Usage

### Basic Agent Setup

```ts
import { Agent, createMessage } from "@rowan-agent/agent";
import { createCoreTools } from "@rowan-agent/runtime";

const tools = createCoreTools({ root: process.cwd() });
const agent = new Agent({
  context: {
    systemPrompt: "You are a helpful coding assistant.",
    messages: [createMessage("user", "list the files in this project")],
    tools,
  },
  model: { provider: "openai-compatible", name: "gpt-4.1-mini" },
  stream,
});

// Subscribe to events
agent.subscribe((event) => {
  console.log(event.type, event.data);
});

// Run the agent
const result = await agent.run();
console.log(result.outcome.message);
```

### Resume a Session

```ts
const agent = new Agent({
  sessionId: "ses_abc123",
  context: { /* reconstructed context */ },
  model,
  stream,
});

const result = await agent.run({
  context: {
    ...agent.state.context,
    messages: [
      ...agent.state.context.messages,
      createMessage("user", "continue where we left off"),
    ],
  },
});
```

### Abort a Running Task

```ts
const agent = new Agent({ /* config */ });

// Start in background
const runPromise = agent.run();

// Cancel after 5 seconds
setTimeout(() => agent.abort(), 5000);

const result = await runPromise;
console.log(result.status); // "aborted"
```

## Key Types

| Type | Description |
|------|-------------|
| `Agent` | Main agent class with run/abort/subscribe |
| `AgentState` | Current agent state (context, model, session) |
| `AgentRunResult` | Result of a completed or aborted run |
| `AgentEvent` | Typed events emitted during execution |
| `PhaseDefinition` | Custom phase configuration |

## Version

Current version: **0.4.6**
