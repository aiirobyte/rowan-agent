# Extensions

Extensions are TypeScript modules that customize Rowan's behavior. They can register hooks, tools, phases, and model providers. Extensions live in `.rowan/extensions/` and are loaded automatically.

> **Related:** [Phases](phases.md) define the workflow structure. Extensions can register phases, intercept phase execution via `before_phase`/`after_phase` hooks, and inject tools into phases.

## Table of Contents

- [Quick Start](#quick-start)
- [Extension Anatomy](#extension-anatomy)
- [ExtensionAPI](#extensionapi)
- [Hooks](#hooks)
- [Custom Tools](#custom-tools)
- [Custom Phases](#custom-phases)
- [Model Providers](#model-providers)
- [Event Bus](#event-bus)
- [Extension Context](#extension-context)
- [Extension Loading](#extension-loading)
- [Error Handling](#error-handling)
- [API Reference](#api-reference)

---

## Quick Start

### Minimal Extension

```
.rowan/extensions/my-plugin/index.ts
```

```typescript
import type { ExtensionAPI } from "@rowan-agent/agent";

export default function(api: ExtensionAPI) {
  // Log every agent start
  api.on("agent_start", (event) => {
    console.log(`Agent started: ${event.sessionId}`);
  });
}
```

That's it. Rowan discovers the extension, calls the factory, and your hooks are live.

### Extension with Tool

```typescript
import type { ExtensionAPI } from "@rowan-agent/agent";

export default function(api: ExtensionAPI) {
  api.registerTool({
    name: "search_docs",
    description: "Search project documentation",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
    execute: async (args) => {
      const { query } = args as { query: string };
      // ... search logic
      return {
        content: [{ type: "text", text: `Results for: ${query}` }],
      };
    },
  });
}
```

### Extension with Phase

```typescript
import type { ExtensionAPI } from "@rowan-agent/agent";

export default function(api: ExtensionAPI) {
  api.registerPhase({
    name: "review",
    description: "Review code changes for issues",
    tools: ["read", "bash"],
    run: async (context) => {
      // ... review logic
      return {
        message: "Review complete: 2 issues found",
        route: "stop",
        payload: { issues: [...] },
      };
    },
  });
}
```

---

## Extension Anatomy

### File Structure

```
.rowan/extensions/
├── my-plugin.ts           # Single-file extension
├── docs-search/           # Directory extension
│   ├── package.json       # Optional manifest
│   └── index.ts           # Entry point
└── analytics/             # Another directory extension
    ├── package.json
    ├── index.ts
    └── lib/
        └── tracker.ts
```

### Discovery Rules

Rowan scans `.rowan/extensions/` and loads:

| Pattern | Example | Loaded |
|---------|---------|--------|
| `*.ts` file | `my-plugin.ts` | Directly |
| `*.js` file | `my-plugin.js` | Directly |
| Directory with `index.ts` | `my-plugin/index.ts` | Entry point |
| Directory with `index.js` | `my-plugin/index.js` | Entry point |
| Directory with `package.json` | Uses `rowan.extensions` field | Specified entries |

### Package Manifest

For directory extensions, declare the entry in `package.json`:

```json
{
  "name": "docs-search",
  "rowan": {
    "extensions": ["./index.ts"]
  }
}
```

### Factory Function

Every extension must default-export a function:

```typescript
// Sync
export default function(api: ExtensionAPI) {
  // ...
}

// Async
export default async function(api: ExtensionAPI) {
  // await async setup
}
```

The factory receives an [`ExtensionAPI`](#extensionapi) — the single entry point for all extension capabilities.

### Available Imports

Extensions can import from:

```typescript
// Main extension Interface
import type { ExtensionAPI } from "@rowan-agent/agent";

// Models (for custom providers)
import type { ProviderConfig } from "@rowan-agent/models";
```

Hook handlers, registration objects, context, utilities, and events are inferred
from `ExtensionAPI`. Named `HookHandler`, `PhaseRegistration`, and
`ToolDefinition` types remain available for reusable helpers.

No compilation step needed — Rowan uses [jiti](https://github.com/unjs/jiti) to load `.ts` files directly.

---

## ExtensionAPI

The `ExtensionAPI` is the contract between extensions and Rowan. Everything an extension can do flows through this object. Its nested context, utility, event, and manifest shapes are documented below but are not separate root exports.

```typescript
interface ExtensionAPI {
  // --- Registration ---
  registerTool(tool: ToolDefinition): void;
  registerPhase(registration: PhaseRegistration): void;
  registerProvider(config: ProviderConfig): void;
  unregisterProvider(name: string): void;

  // --- Hooks ---
  on<K extends HookEventType>(eventType: K, handler: HookHandler<K>): void;
  off<K extends HookEventType>(eventType: K, handler: HookHandler<K>): void;

  // --- Runtime ---
  context: ExtensionContext;    // cwd, signal, exec, system prompt access
  utils: ExtensionUtils;        // createId, formatJson
  events: EventBus;             // inter-extension pub/sub
  manifest?: ExtensionManifest; // from package.json

  // --- Session ---
  session: {
    getContext(): AgentContext;
  };

  // --- Phase I/O ---
  phase: {
    getPayload(): unknown;
    setPayload(payload: unknown): void;
    setMessage(message: string): void;
    getCurrentPhase(): string;
    setNextPhase(phaseName: string): void;
    getNextPhase(): string | undefined;
    getMessage(): string | undefined;
  };
}
```

### Registration Methods

| Method | Description |
|--------|-------------|
| `registerTool(tool)` | Register an LLM-callable tool |
| `registerPhase(registration)` | Register a custom phase |
| `registerProvider(config)` | Register a model provider |
| `unregisterProvider(name)` | Remove a model provider |

### Hook Methods

| Method | Description |
|--------|-------------|
| `on(eventType, handler)` | Subscribe to a hook event |
| `off(eventType, handler)` | Unsubscribe from a hook event |

### Phase I/O

For extensions running inside a phase (factory pattern):

| Method | Description |
|--------|-------------|
| `phase.getPayload()` | Read payload from previous phase |
| `phase.setPayload(payload)` | Set payload for next phase |
| `phase.setMessage(message)` | Set the phase outcome message |
| `phase.getCurrentPhase()` | Get current phase name |
| `phase.setNextPhase(name)` | Set next phase (lower priority than `target`) |
| `phase.getNextPhase()` | Get the next phase set by `setNextPhase` |
| `phase.getMessage()` | Get the message set by `setMessage` |

---

## Hooks

Hooks let extensions intercept and modify agent behavior at specific points. There are 19 hook events in two categories.

### Modifiable Hooks

These hooks return a result to change behavior. The first handler to return a non-undefined result wins (`emitFirst` semantics).

#### `before_phase`

Fires before a phase executes. Can abort, skip, or replace the phase input.

```typescript
api.on("before_phase", (event) => {
  // event.phaseId — phase about to run
  // event.input   — PhaseContext

  // Abort the agent
  return { abort: { status: "aborted", message: "Blocked by policy" } };

  // Skip to another phase
  return { skip: { route: "fallback", message: "Skipping restricted phase" } };

  // Replace phase input
  return { input: { ...event.input, systemPrompt: "Modified prompt" } };

  // No change
  return undefined;
});
```

**Return type:**

```typescript
interface BeforePhaseResult {
  abort?: Outcome;                          // abort the agent
  skip?: { route: string; message: string }; // skip to another phase
  input?: PhaseContext;                      // replace phase input
}
```

#### `after_phase`

Fires after a phase executes. Can abort, retry, or replace the output.

```typescript
api.on("after_phase", (event) => {
  // event.phaseId — phase that completed
  // event.output  — PhaseOutput

  // Retry with new input
  return { retry: { ...event.input, systemPrompt: "Try harder" } };

  // Replace output
  return { output: { ...event.output, message: "Modified result" } };

  return undefined;
});
```

**Return type:**

```typescript
interface AfterPhaseResult {
  abort?: Outcome;       // abort the agent
  retry?: PhaseContext;   // re-execute phase with new input
  output?: PhaseOutput;   // replace phase output
}
```

#### `before_prompt`

Fires before the LLM request is built. Can modify the input sent to the model.

```typescript
api.on("before_prompt", (event) => {
  // event.phaseId — current phase
  // event.input   — PhaseContext

  return {
    input: {
      ...event.input,
      systemPrompt: event.input.systemPrompt + "\n\nAdditional context injected by extension",
    },
  };
});
```

**Return type:**

```typescript
interface BeforePromptResult {
  input?: PhaseContext; // replace LLM input
}
```

#### `before_tool_call`

Fires before a tool executes. Can allow or block.

```typescript
api.on("before_tool_call", (event) => {
  // event.tool — Tool definition
  // event.args — Tool arguments

  if (event.tool.name === "bash") {
    const cmd = (event.args as any).command;
    if (cmd.includes("rm -rf /")) {
      return { allow: false, reason: "Dangerous command blocked" };
    }
  }
  return { allow: true };
});
```

**Return type:**

```typescript
interface BeforeToolCallResult {
  allow: boolean;    // whether to allow execution
  reason?: string;   // rejection reason (when allow=false)
}
```

#### `after_tool_call`

Fires after a tool executes. Can replace the result.

```typescript
api.on("after_tool_call", (event) => {
  // event.tool   — Tool definition
  // event.result  — ToolResult

  if (event.tool.name === "read") {
    // Redact sensitive content
    return {
      result: {
        ...event.result,
        content: event.result.content.replace(/SECRET_KEY=.*/g, "SECRET_KEY=<redacted>"),
      },
    };
  }
  return undefined;
});
```

**Return type:**

```typescript
interface AfterToolCallResult {
  result?: ToolResult; // replace tool result
}
```

### Listen-Only Hooks

These hooks fire and forget — return void. Errors in one handler don't block others (via `Promise.allSettled`).

#### Agent Lifecycle

| Hook | Event Fields | Description |
|------|-------------|-------------|
| `agent_start` | `sessionId` | Agent starts |
| `agent_end` | `sessionId`, `outcome`, `messages` | Agent ends |
| `turn_start` | `messages` | Conversation turn starts |
| `turn_end` | `messages`, `outcome?` | Conversation turn ends |

#### Message Streaming

| Hook | Event Fields | Description |
|------|-------------|-------------|
| `message_start` | `message` | Message streaming begins |
| `message_update` | `message`, `delta` | Streaming update |
| `message_end` | `message` | Message complete |

#### Tool Execution

| Hook | Event Fields | Description |
|------|-------------|-------------|
| `tool_execution_start` | `toolCallId`, `toolName`, `args` | Tool starts |
| `tool_execution_update` | `toolCallId`, `toolName` | Progress update |
| `tool_execution_end` | `toolCallId`, `toolName`, `result` | Tool completes |

#### Session

| Hook | Event Fields | Description |
|------|-------------|-------------|
| `queue_update` | `pendingCount` | Queue state changes |
| `save_point` | `hadPendingMutations` | Session save |
| `abort` | `reason?` | Agent aborted |
| `settled` | *(none)* | Agent idle |

### Hook Usage Examples

#### Audit Log

```typescript
api.on("tool_execution_end", (event) => {
  console.log(`[audit] ${event.toolName}: ${event.result.ok ? "ok" : "error"}`);
});
```

#### Safety Guard

```typescript
api.on("before_tool_call", (event) => {
  if (event.tool.name === "write") {
    const path = (event.args as any).file_path;
    if (path?.includes("..")) {
      return { allow: false, reason: "Path traversal blocked" };
    }
  }
  return { allow: true };
});
```

#### Context Injection

```typescript
api.on("before_prompt", (event) => {
  const extraContext = readFileSync(".context.md", "utf8");
  return {
    input: {
      ...event.input,
      appendSystemPrompt: extraContext,
    },
  };
});
```

#### Phase Guard

```typescript
api.on("before_phase", (event) => {
  if (event.phaseId === "deploy" && !process.env.ALLOW_DEPLOY) {
    return {
      skip: { route: "stop", message: "Deploy not allowed in this environment" },
    };
  }
  return undefined;
});
```

---

## Custom Tools

Register LLM-callable tools via `api.registerTool()`.

### Tool Definition

```typescript
interface ToolDefinition {
  name: string;                    // tool name (used in LLM tool calls)
  description: string;             // description for LLM
  parameters: Record<string, unknown>; // JSON Schema
  execute: (args: unknown, signal?: AbortSignal) => Promise<ToolExecutionResult>;
  executionMode?: "sequential" | "parallel"; // optional override
}

interface ToolExecutionResult {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
}
```

### Example

```typescript
api.registerTool({
  name: "web_search",
  description: "Search the web for information",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
      limit: { type: "number", description: "Max results", default: 5 },
    },
    required: ["query"],
  },
  execute: async (args, signal) => {
    const { query, limit = 5 } = args as { query: string; limit?: number };
    const results = await search(query, limit, { signal });
    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
    };
  },
});
```

### Error Results

Return `isError: true` for tool errors (instead of throwing):

```typescript
execute: async (args) => {
  try {
    const result = await doSomething(args);
    return { content: [{ type: "text", text: result }] };
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error: ${err.message}` }],
      isError: true,
    };
  }
};
```

---

## Custom Phases

Register phases programmatically via `api.registerPhase()`. These are equivalent to file-based phases but defined in code.

### Phase Registration

```typescript
interface PhaseRegistration {
  name: string;              // unique phase identity and display name
  description: string;       // non-empty, at most 1024 characters
  run?: PhaseRun;          // execution function
  tools?: string[];        // restricted tools
  skills?: string[];       // restricted skills
  target?: string;         // forced next phase
  input?: Record<string, string>; // expected input fields
}
```

### Example

```typescript
api.registerPhase({
  name: "deploy",
  description: "Deploy the application",
  tools: ["bash", "read"],
  target: "verify",
  input: {
    environment: "Target environment (staging, production)",
    version: "Version to deploy",
  },
  run: async (context, execution) => {
    const { environment, version } = context.state.payload;

    // Run deploy script
    const result = await execution.exec("bash", ["deploy.sh", environment, version]);

    return {
      message: `Deployed v${version} to ${environment}`,
      route: "verify",
      payload: { deployLog: result.stdout },
    };
  },
});
```

---

## Model Providers

Register custom model providers for LLM access.

```typescript
api.registerProvider({
  id: "custom-openai",
  protocol: "openai-completions",
  baseUrl: "https://llm.example/v1",
  apiKey: process.env.CUSTOM_LLM_API_KEY!,
  headers: { "x-tenant": "tenant-1" },
  timeoutMs: 30_000,
  maxRetries: 2,
  retryDelayMs: 500,
  models: [{
    id: "custom-model",
    protocol: "openai-completions",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 8_192,
  }],
});
```

Known protocols use Rowan's built-in adapter. For a new protocol, provide `streamSimple` and build
it with `executeProviderRequest` or `streamProviderRequest` from
`@rowan-agent/models/providers` to reuse Rowan's transport behavior.

Provider registrations are queued during extension loading and flushed when the `ExtensionRunner` binds. This allows extensions to register providers before the model registry is fully initialized.

To remove a provider:

```typescript
api.unregisterProvider("custom-llm");
```

---

## Event Bus

Extensions communicate with each other through the shared `EventBus` via `api.events`.

```typescript
interface EventBus {
  on(event: string, listener: (...args: unknown[]) => void): () => void; // returns unsubscribe
  emit(event: string, ...args: unknown[]): void;
  off(event?: string): void;           // remove listeners
  has(event: string): boolean;
  count(event: string): number;
}
```

### Example

**Extension A** (producer):

```typescript
export default function(api: ExtensionAPI) {
  api.on("agent_end", (event) => {
    api.events.emit("analytics:session_complete", {
      sessionId: event.sessionId,
      messageCount: event.messages.length,
    });
  });
}
```

**Extension B** (consumer):

```typescript
export default function(api: ExtensionAPI) {
  const unsubscribe = api.events.on("analytics:session_complete", (data) => {
    sendToAnalytics(data);
  });

  // Clean up on agent end
  api.on("agent_end", () => unsubscribe());
}
```

---

## Extension Context

`api.context` provides runtime state and utilities.

### ExtensionContext

```typescript
interface ExtensionContext {
  cwd: string;                              // current working directory
  signal: AbortSignal | undefined;          // fires on agent cancel
  isIdle(): boolean;                        // whether agent is idle
  abort(): void;                            // abort current operation
  exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
  modelId?: string;                         // current model ID
  manifest?: ExtensionManifest;             // from package.json

  // Optional (depends on runtime availability)
  getSystemPrompt?(): string;
  setSystemPrompt?(prompt: string): void;
  getMessages?(): Array<{ role: string; content: string }>;
  addMessage?(role: "user" | "assistant" | "system", content: string): void;
  getAvailableTools?(): Array<{ name: string; description: string }>;
  getAvailableSkills?(): Array<{ name: string; description: string }>;
  getSkillContent?(skillName: string): string;
  getAvailablePhases?(): string[];
  getPhaseContent?(phaseName: string): string;
}
```

### ExecOptions / ExecResult

```typescript
interface ExecOptions {
  cwd?: string;              // working directory
  env?: Record<string, string>; // environment variables
  timeout?: number;          // milliseconds
  signal?: AbortSignal;      // cancellation
}

interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}
```

### ExtensionUtils

```typescript
interface ExtensionUtils {
  createId(prefix: string): string;    // "{prefix}_{timestamp}_{counter}"
  formatJson(value: unknown): string;  // JSON.stringify with indent
}
```

---

## Extension Loading

### Loading

`Agent.loadExtensions(path)` loads extensions from a file, extension package, or directory and returns:

```typescript
{
  extensions: LoadedExtension[];           // successfully loaded
  errors: Array<{ path: string; error: string }>; // load failures
}
```

Pass the result through the Runtime-owned Agent lifecycle:

```typescript
const { extensions } = await Agent.loadExtensions("./.rowan/extensions");
const agent = await runtime.createAgent({ context, model, stream, extensions });
```

Extensions are loaded in sorted order (alphabetical by path).

### Module Loading

Extensions are loaded via [jiti](https://github.com/unjs/jiti) — no compilation step needed. TypeScript files are transpiled on the fly.

**jiti aliases** allow extensions to import from Rowan packages:

```typescript
// These work without npm link:
import type { ExtensionAPI } from "@rowan-agent/agent";
import type { ProviderConfig } from "@rowan-agent/models";
```

### Lifecycle

1. **Discovery** — scan `.rowan/extensions/` for entry points
2. **Load** — import modules via jiti, extract factory functions
3. **Initialize** — call each factory with an `ExtensionAPI`
4. **Bind** — flush pending provider registrations, connect to model registry
5. **Run** — agent loop starts, hooks fire as events occur
6. **Invalidate** — on extension reload or agent reset, old contexts are marked stale

When extensions are supplied to `runtime.createAgent()` or `runtime.reconstructAgent()`, lifecycle steps 1–4 happen inside the Runtime-owned Agent Binding.

### Runtime Protection

After a session replacement or reload, old extension contexts are invalidated:

```typescript
// This throws if the context is stale:
api.context.isIdle(); // Error: "This extension context is stale..."
```

Extensions should not capture and reuse `api` references across session boundaries.

---

## Error Handling

### Extension Errors

Errors in extension code are structured with attribution:

```typescript
interface ExtensionError {
  extensionPath: string;  // which extension
  event: string;          // what operation
  error: string;          // error message
  stack?: string;
}
```

### Hook Error Behavior

| Hook Category | Error Behavior |
|---------------|---------------|
| **Modifiable** (`emitFirst`) | Throws immediately — the hook call fails |
| **Listen-only** (`emit`) | Collected via `Promise.allSettled`, thrown after all handlers run |

### Best Practices

```typescript
export default function(api: ExtensionAPI) {
  // Always return explicitly from modifiable hooks
  api.on("before_tool_call", (event) => {
    try {
      // ... check logic
      return { allow: true };
    } catch (err) {
      console.error(`Hook error: ${err.message}`);
      return { allow: true }; // fail-open for non-critical checks
    }
  });

  // Use try/catch in listen-only hooks
  api.on("tool_execution_end", (event) => {
    try {
      trackUsage(event);
    } catch (err) {
      console.error(`Tracking error: ${err.message}`);
      // Don't rethrow — would block other handlers
    }
  });
}
```

---

## API Reference

### Types

#### ExtensionFactory

```typescript
type ExtensionFactory = (api: ExtensionAPI) => void | Promise<void>;
```

#### PhaseRegistration

```typescript
type PhaseRegistration = {
  name: string;
  description: string;
  run?: (context: PhaseContext, execution: PhaseExecution) => Promise<PhaseOutput | void>;
  tools?: string[];
  skills?: string[];
  target?: string;
  input?: Record<string, string>;
};
```

#### ToolDefinition

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;  // JSON Schema
  execute: (args: unknown, signal?: AbortSignal) => Promise<ToolExecutionResult>;
  executionMode?: "sequential" | "parallel";
}
```

#### ToolExecutionResult

```typescript
interface ToolExecutionResult {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
}
```


### Functions

```typescript
// Load extensions from filesystem
Agent.loadExtensions(path: string): Promise<LoadExtensionsResult>
```

### Hook Event Types (Complete)

```typescript
type HookEventType =
  | "before_phase" | "after_phase"
  | "before_prompt"
  | "before_tool_call" | "after_tool_call"
  | "agent_start" | "agent_end"
  | "turn_start" | "turn_end"
  | "message_start" | "message_update" | "message_end"
  | "tool_execution_start" | "tool_execution_update" | "tool_execution_end"
  | "queue_update" | "save_point" | "abort" | "settled";
```

---

## Examples

### Logging Extension

```typescript
import type { ExtensionAPI } from "@rowan-agent/agent";

export default function(api: ExtensionAPI) {
  api.on("agent_start", (e) => console.log(`[start] ${e.sessionId}`));
  api.on("agent_end", (e) => console.log(`[end] ${e.outcome.status}`));
  api.on("tool_execution_end", (e) => {
    console.log(`[tool] ${e.toolName} → ${e.result.ok ? "ok" : "error"}`);
  });
}
```

### Safety Extension

```typescript
import type { ExtensionAPI } from "@rowan-agent/agent";

export default function(api: ExtensionAPI) {
  const BLOCKED = ["rm -rf", "mkfs", "dd if="];

  api.on("before_tool_call", (event) => {
    if (event.tool.name !== "bash") return { allow: true };
    const cmd = String((event.args as any)?.command ?? "");
    for (const pattern of BLOCKED) {
      if (cmd.includes(pattern)) {
        return { allow: false, reason: `Blocked: contains "${pattern}"` };
      }
    }
    return { allow: true };
  });
}
```

### Context Enrichment Extension

```typescript
import type { ExtensionAPI } from "@rowan-agent/agent";
import { readFileSync } from "node:fs";

export default function(api: ExtensionAPI) {
  api.on("before_prompt", (event) => {
    let extra = "";
    try {
      extra = readFileSync(".rowan/context.md", "utf8");
    } catch { /* no context file */ }

    if (!extra) return undefined;

    return {
      input: {
        ...event.input,
        appendSystemPrompt: `\n\n<project_context>\n${extra}\n</project_context>`,
      },
    };
  });
}
```

### Multi-Extension Coordination

```typescript
// .rowan/extensions/db-tracker.ts
export default function(api: ExtensionAPI) {
  let queryCount = 0;
  api.on("tool_execution_end", (e) => {
    if (e.toolName === "sql") queryCount++;
  });
  api.on("agent_end", () => {
    api.events.emit("stats:db", { queries: queryCount });
  });
}

// .rowan/extensions/reporter.ts
export default function(api: ExtensionAPI) {
  api.events.on("stats:db", (data) => {
    console.log(`Database queries this session: ${data.queries}`);
  });
}
```
