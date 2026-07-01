# @rowan-agent/agent

Core agent runtime for Rowan. Provides a configurable phase-based execution loop, tool calling, session persistence, event streaming, skills, and an extension system for plugins.

## Installation

```bash
bun add @rowan-agent/agent
```

## Quick Start

```ts
import {
  Agent,
  createMessage,
  createCoreTools,
  createDispatchStream,
} from "@rowan-agent/agent";

const agent = new Agent({
  context: {
    systemPrompt: "You are a helpful coding assistant.",
    messages: [createMessage("user", "list the files in this project")],
    tools: createCoreTools({ root: process.cwd() }),
    skills: [],
  },
  model: { provider: "openai", id: "gpt-4.1-mini" },
  stream: createDispatchStream(),
});

agent.subscribe((event) => console.log(event.type));

const result = await agent.run();
console.log(result.outcome?.message);
```

## Agent

The `Agent` class is the public facade. It drives the entire execution loop — from receiving context and tools, through phase-based iteration, to producing a terminal `Outcome`.

```ts
class Agent {
  constructor(options: AgentOptions);
  run(options?: RunOptions): Promise<AgentRunResult>;
  abort(): void;
  subscribe(listener: AgentEventListener): () => void;
  skill(name: string): Promise<void>;
  phase(name: string): Promise<string>;
  waitForIdle(): Promise<void>;
  flushEvents(): Promise<void>;
  readonly status: AgentStatus;
}
```

### AgentOptions

```ts
type AgentOptions = {
  context: AgentContext;
  model: LlmModelRef;
  stream: StreamFn;
  cwd?: string;
  rowanDir?: string;     // project-local Rowan directory, default: ".rowan"
  sessionId?: string;
  phases?: PhaseRegistry;
  extensions?: ExtensionRunnerRef;
  signal?: AbortSignal;
  maxAttempts?: number;

  // Lifecycle hooks
  beforeToolCall?: BeforeToolCall;
  afterToolCall?: AfterToolCall;
  onModelTranscript?: (transcript: ModelTranscript, meta: { phase: string; model: LlmModelRef }) => Promise<void>;
  onMessage?: (message: AgentMessage) => Promise<void>;
  onOutcome?: (outcome: Outcome) => Promise<void>;
};
```

### AgentRunResult

```ts
type AgentRunResult = {
  status: AgentStatus;
  outcome?: Outcome;
  metrics?: LoopMetrics;
  messages: AgentMessage[];
  sessionId: string;
};
```

## AgentContext

The context snapshot that defines what the agent can see and do — the system prompt sets the role, messages form the conversation history, and tools/skills define the capability boundary.

```ts
type AgentContext = {
  systemPrompt: string;
  messages: AgentMessage[];
  tools: Tool[];
  skills: Skill[];
};
```

### AgentMessage

```ts
type AgentMessage = {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string | LlmContentPart[];
  createdAt: string;
  metadata?: Record<string, unknown> & { phase?: string };
};
```

### Outcome

The terminal result produced when the loop completes — carries the final message and all tool call results from the run.

```ts
type Outcome = {
  id: string;
  message: string;
  toolResults?: Array<{
    toolCallId: string;
    toolName: string;
    ok: boolean;
    content: unknown;
    error?: string;
  }>;
};
```

## Tools

Four built-in tools cover file read/write and shell execution — the minimum needed for code-related agent work.

```ts
import { createCoreTools } from "@rowan-agent/agent";

const tools = createCoreTools({
  root: process.cwd(),
  maxReadBytes?,       // default: 64KB
  bashTimeoutMs?,      // default: 30s
  maxBashOutputBytes?, // default: 64KB
});
// Returns: read, write, edit, bash
```

### Built-in Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `read` | Reads a text file within the workspace | `path` (required), `maxBytes?`, `type?` ("skill" \| "phase" \| "markdown" \| "code" \| "file") |
| `write` | Writes content to a file, creating parent directories as needed | `path` (required), `content` (required) |
| `edit` | Replaces exact `oldText` with `newText` in a file | `path` (required), `oldText` (required), `newText` (required), `replaceAll?` |
| `bash` | Runs a bash command within the workspace | `command` (required), `cwd?`, `timeoutMs?`, `maxOutputBytes?` |

### Custom Tools

```ts
import type { Tool, ToolResult } from "@rowan-agent/agent";

const myTool: Tool = {
  name: "search",
  description: "Search project docs",
  parameters: Type.Object({ query: Type.String() }),
  executionMode: "parallel",  // "parallel" | "sequential"
  async execute(args, context, signal): Promise<ToolResult> {
    return { toolCallId: context.toolCallId, toolName: "search", ok: true, content: "..." };
  },
};
```

### Tool Execution Hooks

`beforeToolCall` can intercept or reject tool calls (e.g. for approval flows); `afterToolCall` can modify results before they reach the model.

```ts
const agent = new Agent({
  async beforeToolCall({ tool, args }) {
    return { allow: true };  // or { allow: false, reason: "blocked" }
  },
  async afterToolCall({ tool, result }) {
    return result;
  },
});
```

## Events

13 event types are emitted during execution — useful for logging, UI updates, or external monitoring.

```ts
agent.subscribe((event: AgentEvent) => {
  switch (event.type) {
    case "agent_start":       // { sessionId }
    case "agent_end":         // { sessionId, messages }
    case "turn_start":        // { content }
    case "turn_end":          // { content, outcome? }
    case "model_requested":   // { model, usage }
    case "phase_start":       // { phase }
    case "phase_end":         // { phase }
    case "message_start":     // { message }
    case "message_update":    // { message, delta }
    case "message_end":       // { message }
    case "tool_execution_start":   // { toolCallId, toolName, args }
    case "tool_execution_update":  // { toolCallId, toolName, args, partialResult }
    case "tool_execution_end":     // { toolCallId, toolName, result, isError }
  }
});
```

### Parallel Phase Events

When multiple phases run concurrently (via multi-target `route`), each branch emits its own `turn_*`, `message_*`, and `tool_execution_*` events into the shared event stream — they are interleaved, not sequenced. Individual parallel phases do **not** emit `phase_start`/`phase_end`; those only fire for serial phases. After all branches complete, their outputs are stashed and surfaced in the next iteration's phase entry message (under `<prev_phase_outputs>`); the `message_start`/`message_end` you observe for that entry message carry the merged results.

## Session

JSONL-based session persistence — lets multi-turn conversations survive across process restarts. Supports create, resume, branch, and history replay.

```ts
import { LocalJsonlSessionManager } from "@rowan-agent/agent";

const session = await LocalJsonlSessionManager.create(sessionsDir, { workspaceRoot: process.cwd() });
const session = await LocalJsonlSessionManager.open(sessionsDir, sessionId);
const sessions = await LocalJsonlSessionManager.list(sessionsDir);

await session.appendMessage(message);
await session.appendOutcome(outcome);
await session.appendExecutionTurn(turn);
const context = await session.buildAgentContext({ tools });
await session.branch(entryId);
```

## Skills

Skills are `SKILL.md` knowledge bundles that get injected into the agent context, extending its domain knowledge without changing code.

```ts
import { loadSkill, loadSkills, resolveSkillPath } from "@rowan-agent/agent";

const skills = await loadSkills(workspace);
const skill = await loadSkill(path, workspace);
const path = resolveSkillPath("example", workspace);
// → <rowanDir>/skills/example/SKILL.md
```

## Phases

Phases are the basic units of the execution loop. There are no built-in phases — when none are configured, a `"default"` phase lets the LLM drive execution and routing directly.

### How It Works

Each phase's `PHASE.md` content is injected as a system message, giving the LLM phase-specific instructions. A `route` tool is automatically added — the LLM calls it to decide what happens next: continue, stop, or transition to another phase.

```
Per iteration:
  1. Hot-reload phase configs from disk (PHASE.md)
  2. Inject phase instructions as system message
  3. Execute phase (factory | run | LLM fallback)
  4. Extract routing decision from route tool call
  5. Transition, continue, or stop
```

### Example Phase Flow

```
┌────────────┐
│ User Input │
└─────┬──────┘
      ▼
┌────────────┐  route("plan")   ┌────────────┐
│  default   │ ────────────────▶│    plan     │
└────────────┘                  └─────┬──────┘
                                      │
                              route("execute")
                                      │
                                      ▼
                              ┌────────────┐
                              │  execute   │◀──────────────┐
                              └─────┬──────┘               │
                                    │                      │
                            route("review")         route("execute")
                                    │              (loop: fix issues)
                                    ▼
                              ┌────────────┐
                              │   review   │
                              └─────┬──────┘
                                    │
                     route({ decision: [{ phase: "lint" }, { phase: "typecheck" }] })
                                    │
                          ┌─────────┴─────────┐
                          ▼                   ▼
                    ┌──────────┐        ┌──────────┐
                    │   lint   │        │typecheck │
                    └────┬─────┘        └────┬─────┘
└─────────┬─────────┘
                                    ▼
                       merged into <prev_phase_outputs>
                                    │
                             route("stop")
                                   │
                                   ▼
                             ┌──────────┐
                             │  Outcome │
                             └──────────┘
```

Each arrow is an LLM routing decision via the `route` tool. Parallel branches run concurrently and merge back before the next transition.

### Providing Phases

Two sources, merged by priority:

**File-based** — `<workspace>/.rowan/phases/*/PHASE.md`

```
.rowan/phases/review/
├── PHASE.md       # YAML frontmatter + markdown body
└── index.ts       # optional: factory or run function
```

```yaml
---
name: Code Review
description: Review code for correctness and style
tools: [read, bash]
target: execute
---

Review the current implementation for bugs and style issues.
```

**Extension-registered** — via `api.registerPhase()`. Same id overrides file-based phases.

```ts
import type { ExtensionAPI } from "@rowan-agent/agent";

export default function myPlugin(api: ExtensionAPI) {
  api.registerPhase({
    id: "review",
    name: "Code Review",
    description: "Review code for correctness",
    tools: ["read", "bash"],
    async run(context, execution) {
      const result = await execution.invokeModel(context);
      return { message: result.text, route: "stop" };
    },
  });
}
```

### Phase

```ts
interface Phase {
  id: string;
  name: string;
  description: string;
  tools?: string[];              // restrict tools (undefined = all)
  skills?: string[];             // restrict skills
  target?: string;               // forced next phase (overrides route tool)
  isolated?: boolean;            // empty context when run in parallel
  content: string;               // PHASE.md body
  factory?: (api: ExtensionAPI) => Promise<void>;
  run?: (context: PhaseContext, execution: PhaseExecution) => Promise<PhaseOutput | void>;
}
```

### PhaseContext / PhaseOutput

```ts
interface PhaseContext {
  systemPrompt: string;
  messages: AgentMessage[];
  tools: Tool[];
  skills: Skill[];
  state: PhaseState;             // { current, available, iterations, payload }
}

type PhaseOutput = {
  message: string;
  route: string;                 // "continue" | "stop" | <phase-id>
  payload?: unknown;             // data passed to the next phase
};
```

### Parallel Execution (Fork/Join)

When the route tool returns multiple targets, phases run concurrently:

```ts
route({ decision: [{ phase: "research" }, { phase: "analyze" }] });
```

Each target gets a forked copy of the current messages (or empty if `isolated: true`), runs concurrently via `Promise.allSettled()`, and results are merged back into the conversation. See [docs/phases.md](docs/phases.md).

## Extensions

The extension system lets plugins register lifecycle hooks, tools, phases, model providers, and cross-plugin events. Plugins are discovered from `<workspace>/.rowan/extensions`.

```ts
import { createExtensionRunner, discoverAndLoadExtensions } from "@rowan-agent/agent";

const { extensions } = await discoverAndLoadExtensions(cwd);
const runner = createExtensionRunner({ cwd });
await runner.loadExtensions(extensions);
```

### ExtensionRunner

```ts
class ExtensionRunner {
  readonly hooks: HooksManager;  // 19 lifecycle hook types
  readonly events: EventBus;     // cross-plugin event channel

  loadExtensions(extensions: LoadedExtension[]): Promise<void>;
  getAllRegisteredTools(): RegisteredTool[];
  getPhases(): Phase[];
  createPhaseRegistry(): PhaseRegistry;
  signal: AbortSignal;
  abort(): void;
}
```

### Hook Types

| Category | Hooks |
|----------|-------|
| Agent | `agent_start`, `agent_end` |
| Turn | `turn_start`, `turn_end` |
| Phase | `before_phase`, `after_phase` |
| Prompt | `before_prompt` |
| Message | `message_start`, `message_update`, `message_end` |
| Tool | `before_tool_call`, `after_tool_call`, `tool_execution_start`, `tool_execution_update`, `tool_execution_end` |
| Lifecycle | `queue_update`, `save_point`, `abort`, `settled` |

### Plugin Format

```
<workspace>/.rowan/extensions/my-plugin/
├── package.json     # { "rowan": { "extensions": ["./index.ts"] } }
└── index.ts
```

```ts
import type { ExtensionAPI } from "@rowan-agent/agent";

export default function myPlugin(rowan: ExtensionAPI) {
  rowan.on("agent_start", (event) => { ... });
  rowan.registerTool({ name: "my_tool", description: "...", parameters: {...}, execute: async (args) => {...} });
  rowan.registerPhase({ id: "review", description: "...", run: async (ctx) => {...} });
  rowan.events.emit("my-plugin:ready", {});
}
```

> **Full reference:** [Extensions Documentation](docs/extensions.md)

## Configuration

Multi-provider model configuration via `.rowan/config.yaml`. Supports multiple API providers, per-model settings, environment variable interpolation, and per-phase model overrides.

Config is loaded from the runtime Rowan directory, which defaults to `.rowan` and can be set when constructing `Agent` via `rowanDir`.

### Config File

Place `config.yaml` in your `.rowan/` directory (alongside `phases/`, `skills/`, etc.):

```
<workspace>/
└── .rowan/
    ├── config.yaml      # model configuration
    ├── phases/           # phase definitions
    ├── skills/           # skill bundles
    └── extensions/       # plugins
```

### Schema

```yaml
model:                    # optional: explicit default model override
  provider: <string>      # → providers[].id
  id: <string>            # → providers[].models[].id

logLevel: <string>        # optional: run log detail (default: "info")
                          # one of: debug, info, warn, error, silent
                          # priority: --log-level flag > config > ROWAN_LOG_LEVEL env > "info"

providers:                # required: at least one provider
  - id: <string>          # required: provider identifier
    name: <string>        # optional: display name
    baseUrl: <string>     # required: API base URL
    apiKey: <string>      # required: API key (supports ${VAR} interpolation)
    protocol: <string>    # required: API protocol (see table below)
    timeoutMs: <number>   # optional: request timeout (default: 60000)
    maxRetries: <number>  # optional: retry count (default: 4)
    retryDelayMs: <number># optional: delay between retries (default: 1000)
    headers:              # optional: extra HTTP headers
      <string>: <string>
    models:               # required: at least one model
      - id: <string>      # required: model identifier
        name: <string>    # optional: display name (defaults to id)
        primary: <bool>   # optional: mark as default agent model
        reasoning: <bool> # optional: reasoning model (default: false)
        input:            # optional: supported input types (default: ["text"])
          - "text"
          - "image"
        contextWindow: <number>  # optional: max context tokens (default: 128000)
        maxTokens: <number>      # optional: max output tokens (default: 16384)
        cost:                    # optional: per-token costs (default: all 0)
          input: <number>
          output: <number>
          cacheRead: <number>
          cacheWrite: <number>
```

### Protocols

| Protocol | Description |
|----------|-------------|
| `openai-completions` | OpenAI Chat Completions API (`/v1/chat/completions`) |
| `openai-responses` | OpenAI Responses API (`/v1/responses`) |
| `anthropic-messages` | Anthropic Messages API (`/v1/messages`) |

### Environment Variable Interpolation

Use `${VAR_NAME}` syntax in any string value to reference environment variables:

```yaml
apiKey: ${OPENAI_API_KEY}
```

Undefined or empty variables throw an error at config load time.

### Default Model Resolution

When no `--model` flag is passed, the default model is resolved in order:

1. **Top-level `model:`** — explicit override in config
2. **`primary: true`** — first model marked primary (by file order)
3. **First model** — first model in config (by parse order)

### Per-Phase Model Override

Override the model for a specific phase via PHASE.md frontmatter:

```yaml
---
name: Review
description: Deep code review
model: anthropic/claude-sonnet-4-20250514   # format: provider/id or just id
---

Review the implementation for correctness...
```

- `model: gpt-4.1` — wildcard provider, resolved by model ID
- `model: anthropic/claude-sonnet-4-20250514` — specific provider + model

### Loading Config

```ts
import {
  loadConfigFile,
  registerConfigModels,
  resolveDefaultModel,
  parseModelRef,
} from "@rowan-agent/agent";

// Load from .rowan/config.yaml (returns undefined if missing)
const config = await loadConfigFile(workspace);

// Register all configured models into the global registry
if (config) registerConfigModels(config);

// Resolve default model
const defaultModel = config ? resolveDefaultModel(config) : undefined;

// Parse a model reference string
const ref = parseModelRef("anthropic/claude-sonnet-4-20250514");
// → { provider: "anthropic", id: "claude-sonnet-4-20250514" }
```

### Config Types

```ts
type AgentConfigFile = {
  model?: { provider: string; id: string };
  providers: ProviderConfigFromFile[];
};

type ProviderConfigFromFile = {
  id: string;
  name?: string;
  baseUrl: string;
  apiKey: string;
  protocol: Protocol;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  headers?: Record<string, string>;
  models: ModelConfigFromFile[];
};

type ModelConfigFromFile = {
  id: string;
  name?: string;
  primary?: boolean;
  reasoning?: boolean;
  input?: ("text" | "image")[];
  contextWindow?: number;
  maxTokens?: number;
  cost?: Partial<ModelCost>;
};
```

## Context & Prompt

Helpers for assembling system prompts and building model requests.

```ts
import {
  buildSystemPrompt,
  buildModelRequest,
  conversationMessages,
  latestUserInput,
  serializeSkills,
} from "@rowan-agent/agent";

const prompt = buildSystemPrompt({ systemPrompt, tools, skills, cwd });
const messages = conversationMessages(agentMessages);
const request = buildModelRequest({ systemPrompt, messages, tools });
```

## Workspace

Workspace resolution uses the current project for both source and binary runs. The project Rowan directory defaults to `<cwd>/.rowan`; pass `rowanDir` to resolve another project-local directory.

```ts
import { resolveWorkspacePaths, resolveInWorkspace } from "@rowan-agent/agent";

const workspace = resolveWorkspacePaths();
// → { mode: "source" | "binary", cwd: string, rowanDir: string }

const custom = resolveWorkspacePaths({ rowanDir: ".rowan-project" });
// → custom.rowanDir is <cwd>/.rowan-project
```

## Loop Metrics

```ts
type LoopMetrics = {
  iterations: number;
  phaseTransitions: Array<{ from: string; to: string; ts: string }>;
  compactionCount: number;
  retryCount: number;
  startedAt: string;
  durationMs?: number;
};
```

## Key Types

| Type | Description |
|------|-------------|
| `Agent` | Main agent facade |
| `AgentContext` | System prompt, messages, tools, skills |
| `AgentMessage` | Typed message with role, content, metadata |
| `AgentEvent` | Discriminated union of 13 event types |
| `Tool` / `ToolResult` | Tool definition and execution result |
| `Skill` | Loaded skill bundle |
| `Phase` | Phase definition with content, execution, and routing config |
| `PhaseContext` / `PhaseOutput` | Phase input and output |
| `PhaseRegistry` | Map of phase ids to Phase objects plus entry phase id |
| `Outcome` | Terminal result with message and tool results |
| `LoopMetrics` | Loop iteration, timing, and phase transition stats |
| `LocalJsonlSessionManager` | JSONL session manager |
| `ExtensionRunner` | Extension runtime with hooks and events |
| `HooksManager` / `EventBus` | Hook registry and cross-plugin event channel |
| `StreamFn` / `LlmModelRef` | Model stream function and model reference |
| `AgentConfigFile` | Parsed `.rowan/config.yaml` structure |
| `ProviderConfigFromFile` / `ModelConfigFromFile` | Provider and model config entries |
| `loadConfigFile` / `registerConfigModels` / `resolveDefaultModel` | Config loading and model registration |
| `parseModelRef` | Parse `"provider/id"` or `"id"` strings to `LlmModelRef` |

## Documentation

| Doc | Description |
|-----|-------------|
| [Phases](docs/phases.md) | Phase lifecycle, PHASE.md format, parallel execution, routing, payload |
| [Extensions](docs/extensions.md) | Extension API, 19 hooks, custom tools/phases, model providers, event bus |

## Version

Current version: **0.4.6**
