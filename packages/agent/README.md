# @rowan-agent/agent

Embedded durable agent runtime for Rowan. It owns Agent lifecycle, scheduling,
recovery, Tool Calls, and Runtime Events while preserving the configurable
phase loop, Sessions, skills, and extension system.

## Installation

```bash
bun add @rowan-agent/agent
```

## Quick Start

The durable lifecycle is the public entrypoint: start one `AgentRuntime`, create
or reconstruct an `Agent`, submit input with `send()`, and wait on the returned
`AgentRun`.

```ts
import {
  AgentRuntime,
  InMemoryRuntimeStateStore,
  InMemorySessionStore,
  createCoreTools,
} from "@rowan-agent/agent";

const runtime = await AgentRuntime.start({
  stateStore: new InMemoryRuntimeStateStore(),
  sessionProvider: new InMemorySessionStore(),
});

try {
  const agent = await runtime.createAgent({
    context: {
      systemPrompt: "You are a helpful coding assistant.",
      messages: [],
      tools: createCoreTools({ root: process.cwd() }),
      skills: [],
      phases: {
        phases: new Map(),
        entryPhaseId: default,
      },
    },
    model: {
      provider: "openai",
      id: "gpt-4.1-mini",
      protocol: "openai-completions",
      baseUrl: "https://api.openai.com/v1",
      apiKey: process.env.OPENAI_API_KEY!,
    },
  });

  agent.subscribe((event) => console.log(event.type));
  const run = await agent.send("list the files in this project");
  console.log((await run.result()).message);
} finally {
  await runtime.stop();
}
```

Use `runtime.reconstructAgent(agentId, currentOptions)` to bind an existing
durable Agent to its Session with current resources. `send()` is non-blocking;
`AgentRun.result()` waits for its durable terminal Outcome.

The example uses in-memory adapters. Use `SqliteRuntimeStateStore` and a
persistent Session provider when state must survive a process restart.

## AgentRuntime

Exactly one `AgentRuntime` may be active in a process. It is the sole owner of
Agent creation and reconstruction, durable input, scheduling, leases, Runtime
Events, and Tool Call control. Always stop it during host shutdown.

```ts
type AgentRuntimeOptions = {
  stateStore: InMemoryRuntimeStateStore | SqliteRuntimeStateStore;
  sessionProvider?: InMemorySessionStore | JsonlSessionStore;
  toolPolicy?: ToolRuntimePolicy;
  maxConcurrentRuns?: number;
  maxInfrastructureAttempts?: number;
  leaseDurationMs?: number;
  leaseRenewalIntervalMs?: number;
};

class AgentRuntime {
  static start(options: AgentRuntimeOptions): Promise<AgentRuntime>;
  createAgent(options: AgentOptions): Promise<Agent>;
  reconstructAgent(agentId: AgentId, options: AgentOptions): Promise<Agent>;
  pauseAgent(agentId: AgentId): Promise<void>;
  resumeAgent(agentId: AgentId): Promise<void>;
  getMessage(messageId: RuntimeMessageId): Promise<RuntimeMessage | undefined>;
  getToolCall(toolCallId: RuntimeToolCallId): Promise<RuntimeToolCall | undefined>;
  getRun(runId: AgentRunId): Promise<AgentRunRecord | undefined>;
  abortRun(runId: AgentRunId, reason?: string): Promise<void>;
  consumeEvents(
    consumerId: string,
    listener: RuntimeEventListener,
  ): () => void;
  listEvents(cursor?: RuntimeEventCursor): Promise<RuntimeEvent[]>;
  stop(): Promise<void>;
}
```

A Session provider is required by `createAgent()` and `reconstructAgent()`.
Runtime State and conversation history are deliberately separate:

| Concern | Durable adapter | In-memory adapter |
|---------|-----------------|-------------------|
| Agent records, Messages, Runs, Leases, Runtime Events, Tool Calls | `SqliteRuntimeStateStore` | `InMemoryRuntimeStateStore` |
| Conversation messages, model transcripts, Outcomes | `JsonlSessionStore` | `InMemorySessionStore` |

The SQLite Runtime schema has no compatibility migration. Replace an older
Runtime database when adopting a breaking schema; Session JSONL records remain
separate.

### Scheduling and Runtime Commands

The Scheduler runs at most one Run for each Agent and up to
`maxConcurrentRuns` across different Agents. `pauseAgent()` gates queued and new
work without cancelling a Run that is already executing; `resumeAgent()` opens
that gate. `abortRun()` targets one precise Run.

Lease failures and model/provider errors marked `retryable: true` are retried.
The Runtime renews active leases and retries them up to
`maxInfrastructureAttempts`; exhausted work fails and its triggering Message is
dead-lettered.

### Process Recovery

Runtime startup recovers abandoned Leases into durable queued work without
constructing Agent Bindings. The host supplies its current executable resources
when it reconstructs an Agent:

```ts
const runtime = await AgentRuntime.start({ stateStore, sessionProvider });
const agent = await runtime.reconstructAgent(agentId, currentAgentOptions);
```

Reconstruction preserves the Agent ID and Session ID. Establishing the Binding
automatically schedules queued Runs. A suspended Agent may remain unbound until
the host has new input, then reconstruct before calling `send()`.

## Agent

`AgentRuntime` is the only lifecycle owner. `Agent` is a bound facade: it cannot
be directly constructed and has no independent `run()` path.

The `Agent` class is the public facade for one Runtime-owned Agent Binding.

```ts
class Agent {
  readonly id: AgentId;
  readonly sessionId: string;
  send(input: string | AgentMessage): Promise<AgentRun>;
  subscribe(listener: AgentEventListener): () => void;
  flushEvents(): Promise<void>;

  // Resource discovery helpers
  static loadSkills(targetPath: string): Promise<Skill[]>;
  static loadPhases(targetPath: string): Promise<PhaseRegistry>;
  static loadExtensions(targetPath: string): Promise<LoadExtensionsResult>;
}
```

### AgentOptions

```ts
type ModelConfig = ModelRef & {
  protocol: Protocol;
  baseUrl: string;
  apiKey: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
};

type AgentCommonOptions = {
  context: AgentContext;
  cwd?: string;
  extensions?: LoadedExtension[];
  maxAttempts?: number;

  // Lifecycle hooks
  beforeToolCall?: BeforeToolCall;
  afterToolCall?: AfterToolCall;
  onModelTranscript?: (transcript: ModelTranscript, meta: { phase: string; model: ModelRef }) => Promise<void>;
  onMessage?: (message: AgentMessage) => Promise<void>;
  onOutcome?: (outcome: Outcome) => Promise<void>;
};

type AgentOptions = AgentCommonOptions & (
  | { model: ModelConfig; stream?: never }
  | { model: ModelRef; stream: StreamFn }
);
```

### Conversation Continuation

Every turn enters through `send()`. The Runtime persists the input before it
returns an `AgentRun`; Session history is restored during reconstruction.

```ts
const first = await agent.send("summarize this repository");
console.log((await first.result()).message);

const second = await agent.send("now focus on the CLI package");
console.log((await second.result()).message);
```

If a Run is suspended waiting for input, the next `send()` to that Agent resumes
the same Run instead of creating a second one.

Suspended Runs persist the current input request in `AgentRunRecord.inputRequest`
so a reconstructed Runtime can show the question without replaying a transient
Agent Event. The request contains its phase, prompt, and timestamp; it is cleared
when the Run resumes.

### Updating Runtime Resources

Resources are fixed for a live Agent Binding. Apply a new model, prompt, Tool
set, Skill set, Phase registry, or Extension set during reconstruction. A
duplicate live Binding is rejected, so explicit reconstruction normally occurs
after the previous process or Runtime has stopped.

```ts
const agentId = agent.id;
await runtime.stop();

const nextRuntime = await AgentRuntime.start({ stateStore, sessionProvider });
const reconstructed = await nextRuntime.reconstructAgent(agentId, {
  context: currentContext,
  model: currentModelConfig,
});
```

## AgentRun

`send()` returns a Runtime-owned handle immediately after the input and Run are
durable. The handle exposes cached state for synchronous inspection and can
refresh from the Runtime Store when needed.

```ts
type AgentInputRequest = {
  phase: string;
  prompt: string;
  requestedAt: string;
};

class AgentRun {
  readonly id: AgentRunId;
  readonly messageId: string;
  readonly status: AgentRunState;
  readonly state: AgentRunState; // alias of status
  readonly inputRequest?: AgentInputRequest;

  getStatus(): Promise<AgentRunState>;
  subscribe(listener: AgentRunListener): () => void;
  consumeRuntimeEvents(
    consumerId: string,
    listener: (event: RuntimeEvent) => void | Promise<void>,
  ): () => void;
  result(): Promise<Outcome>;
  abort(reason?: string): Promise<void>;
}
```

`result()` waits through queued, running, and suspended states. Completed,
failed, and cancelled Runs all resolve to their persisted terminal `Outcome`;
inspect `status` when the distinction matters. `abort()` affects only this Run.

## AgentContext

The context snapshot that defines what the agent can see and do — the system prompt sets the role, messages form the conversation history, and tools/skills define the capability boundary.

```ts
type AgentContext = {
  systemPrompt: string;
  messages: AgentMessage[];
  tools: Tool[];
  skills: Skill[];
  // Optional custom phases; Agent merges them with its built-in "default" phase.
  phases?: PhaseRegistry;
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
  payload?: unknown;
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
const agent = await runtime.createAgent({
  context,
  model,
  stream,
  async beforeToolCall({ tool, args }) {
    return { allow: true };  // or { allow: false, reason: "blocked" }
  },
  async afterToolCall({ tool, result }) {
    return result;
  },
});
```

### Runtime Tool Policy

Every managed Tool Call passes through the Runtime before its adapter executes.
Runtime policy can narrow the Agent's Tool set and cap concurrency, but it can
never add a capability that was not supplied in `AgentContext`.

```ts
const runtime = await AgentRuntime.start({
  stateStore,
  sessionProvider,
  toolPolicy: {
    allowedTools: ["read", "bash", "task_manage", "resource_manage"],
    maxConcurrent: 8,
    perToolMaxConcurrent: { bash: 2 },
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

### Durable Runtime Events

Runtime State transitions are a separate durable stream. Give each consumer a
stable ID; its Checkpoint advances only after the listener succeeds. Delivery
is asynchronous, so a slow or unavailable consumer does not block state
transitions.

```ts
const stopConsuming = runtime.consumeEvents("deployment-observer", async (event) => {
  await deliverRuntimeFact(event);
});
```

Runtime Messages and their related Events are committed together. A durable
consumer can use a `run_enqueued` Event as an outbox signal, read immutable
business correlation metadata from its Message, and update an external index
before its Checkpoint advances:

```ts
const stopIndexing = runtime.consumeEvents("everyield-run-index", async (event) => {
  if (event.kind !== "run_enqueued" || !event.messageId || !event.runId) return;
  const message = await runtime.getMessage(event.messageId);
  if (!message) throw new Error(`Runtime Message not found: ${event.messageId}`);
  await upsertRunIndex(event.runId, message.input.metadata);
});
```

If the listener fails, Rowan leaves the Checkpoint unchanged and redelivers the
Event after the consumer restarts. `getMessage()` is read-only; Rowan treats the
Agent Message metadata as opaque host data.

Tool Call Events can likewise be resolved to their durable record. This is
especially useful when a `tool_call_indeterminate` Event requires host recovery
or human review:

```ts
if (event.kind === "tool_call_indeterminate" && event.toolCallId) {
  const toolCall = await runtime.getToolCall(event.toolCallId);
  await reviewIndeterminateToolCall(toolCall);
}
```

A consumer may instead return an `enqueue` disposition to turn the current
Event into Agent Input. Rowan enqueues the input and advances the Consumer
Checkpoint in one Runtime State transaction, then schedules the target Agent.

```ts
const stopRouting = runtime.consumeEvents("delegated-results", (event) => {
  if (event.kind !== "run_completed" || !event.agentId) return;
  return {
    type: "enqueue",
    agentId: targetAgentId,
    input: createMessage("user", JSON.stringify(event.payload), {
      sourceEventId: event.id,
    }),
  };
});
```

Only one live subscription may use a Consumer ID. If delivery fails, its
Checkpoint stays put and the Event is delivered again when that Consumer is
started later. `runtime.listEvents()` inspects the durable stream without
advancing a Consumer Checkpoint. Use `run.consumeRuntimeEvents()` for the same
delivery contract filtered to one Run.

### Parallel Phase Events

When multiple phases run concurrently (via multi-target `route`), each branch emits its own `turn_*`, `message_*`, and `tool_execution_*` events into the shared event stream — they are interleaved, not sequenced. Individual parallel phases do **not** emit `phase_start`/`phase_end`; those only fire for serial phases. After all branches complete, their outputs are stashed and surfaced in the next iteration's phase entry message (under `<prev_phase_outputs>`); the `message_start`/`message_end` you observe for that entry message carry the merged results.

## Session

JSONL-based session persistence — lets multi-turn conversations survive across process restarts. Supports create, resume, branch, and history replay.

```ts
import { JsonlSessionStore } from "@rowan-agent/agent";

const sessions = new JsonlSessionStore(sessionsDir);
const session = await sessions.create({
  systemPrompt,
  input: "",
  skills: [],
});
const resumed = await sessions.open(sessionId);
const savedSessions = await sessions.list();

await session.appendMessage(message);
await session.appendOutcome(outcome);
const context = await session.buildAgentContext({ tools });
```

## Skills

Skills are `SKILL.md` knowledge bundles that get injected into the agent context, extending its domain knowledge without changing code.

```ts
import { Agent } from "@rowan-agent/agent";

const skills = await Agent.loadSkills("/User/Skills");
```

## Phases

Phases are the basic units of the execution loop. There are no built-in phases — when none are configured, a `"default"` phase lets the LLM drive execution and routing directly.

### How It Works

Each phase's `PHASE.md` content is injected as a system message, giving the LLM phase-specific instructions. A `route` tool is automatically added — the LLM calls it to decide what happens next: continue, stop, or transition to another phase.

```
Per iteration:
  1. Read Agent-normalized `context.phases`
  2. Inject phase instructions as system message
  3. Execute phase (factory | run | LLM fallback)
  4. Extract routing decision from route tool call
  5. Transition, continue, or stop
```

**`entryPhaseId`** specifies which phase the loop enters for a newly bound Agent. When phases are loaded from `.rowan/phases/`, the first discovered phase becomes the entry. When none are configured, the Agent normalises to `"default"`. Later turns start from the normalized default phase. This field is an internal routing hint and is not exposed to the model.

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
  state: PhaseState;             // { current, available, entryPhaseId, iterations, payload }
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
import { Agent } from "@rowan-agent/agent";

const { extensions } = await Agent.loadExtensions(`${cwd}/.rowan/extensions`);
// Extensions are fixed for this Runtime-owned Agent Binding.
const agent = await runtime.createAgent({ context, model, stream, extensions });
```

### Extension Runtime

Extension orchestration is internal. The Runtime-owned Agent Binding loads extensions, binds their hooks and events, invalidates their context, and aborts them with the run.

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

## Model Selection

`AgentOptions` accepts either one complete `ModelConfig`, which Rowan binds to an Agent-local default stream, or a model reference plus a custom `StreamFn`. A phase model override therefore requires a custom stream that can resolve the override.

CLI-specific `.rowan/config.yaml` loading and workspace discovery belong to [`@rowan-agent/cli`](../cli/README.md).

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
| `AgentRuntime` | Process-wide lifecycle, scheduling, recovery, Event, and Tool owner |
| `Agent` | Runtime-owned facade for input and transient Stream Events |
| `AgentRun` | Durable Run handle for state, terminal Outcome, observation, and abort |
| `SqliteRuntimeStateStore` / `InMemoryRuntimeStateStore` | Durable and test Runtime Store adapters |
| `RuntimeEvent` / consumer ID string | Durable lifecycle facts and checkpointed consumer identity |
| `RuntimeMessage` / `RuntimeMessageId` | Durable Agent Input and its stable lookup identity |
| `RuntimeToolCall` / `RuntimeToolCallId` | Durable Tool Call state and its stable lookup identity |
| `AgentContext` | System prompt, messages, tools, skills, phases |
| `AgentMessage` | Typed message with role, content, metadata |
| `AgentEvent` | Discriminated union of 13 event types |
| `Tool` / `ToolResult` | Tool definition and execution result |
| `Skill` | Loaded skill bundle |
| `Phase` | Phase definition with content, execution, and routing config |
| `PhaseContext` / `PhaseOutput` | Phase input and output |
| `PhaseRegistry` | Map of phase ids to Phase objects plus entry phase id |
| `Outcome` | Terminal result with message and tool results |
| `LoopMetrics` | Loop iteration, timing, and phase transition stats |
| `SessionManagerProvider` | Session lifecycle seam used by the Runtime |
| `JsonlSessionStore` / `InMemorySessionStore` | JSONL and in-memory Session adapters |
| `ExtensionAPI` / `ExtensionFactory` | Extension developer interface |
| `StreamFn` / `ModelRef` | Model stream function and model reference |

## Documentation

| Doc | Description |
|-----|-------------|
| [Phases](docs/phases.md) | Phase lifecycle, PHASE.md format, parallel execution, routing, payload |
| [Extensions](docs/extensions.md) | Extension API, 19 hooks, custom tools/phases, model providers, event bus |

## Version

Current version: **0.6.0**
