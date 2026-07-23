# Phases

Phases are the core unit of work in Rowan's agent loop. Each phase defines a bounded task — what tools and skills are available, what instructions the LLM follows, and where execution routes next. Phases compose into workflows through routing.

> **Related:** [Extensions](extensions.md) can register custom phases programmatically, intercept phase execution via hooks, and modify phase behavior at runtime.

## Table of Contents

- [Quick Start](#quick-start)
- [How Phases Work](#how-phases-work)
- [PHASE.md Format](#phasemd-format)
- [Execution Modes](#execution-modes)
- [The Route Tool](#the-route-tool)
- [Parallel Execution](#parallel-execution)
- [Inter-Phase Data](#inter-phase-data)
- [Reloading File Phases](#reloading-file-phases)
- [API Reference](#api-reference)

---

## Quick Start

### Markdown-Only Phase

The simplest phase — just a `PHASE.md` with frontmatter. The LLM follows your instructions and uses the `route` tool to transition.

```
.rowan/phases/summarize/PHASE.md
```

```markdown
---
name: summarize
description: Summarize a codebase or document
input:
  target: "What to summarize"
---

You are in the **summarize** phase. Analyze the target and produce a concise summary.

## Steps

1. Read the target files
2. Identify key points
3. Produce a structured summary

## Routing

When complete, call `route` with `stop`.
```

### Phase with Code

For phases that need programmatic logic — API calls, file processing, data transformation — add an `index.ts` (or `index.js`) alongside `PHASE.md`.

```
.rowan/phases/fetch-data/
├── PHASE.md
└── index.ts
```

**`index.ts` — Run pattern** (direct execution):

```typescript
export async function run(context, execution) {
  const url = context.state.payload?.url;
  const response = await fetch(url);
  const data = await response.json();

  return {
    message: `Fetched ${data.length} records`,
    route: "stop",
    payload: { records: data },
  };
}
```

**`index.ts` — Factory pattern** (extension-style):

```typescript
import type { ExtensionAPI } from "@rowan-agent/agent";

export default function(api: ExtensionAPI) {
  // Use api.on(), api.registerTool(), etc.
  api.registerTool({
    name: "fetch_api",
    description: "Fetch data from external API",
    parameters: { type: "object", properties: { url: { type: "string" } } },
    execute: async (args) => {
      const { url } = args as { url: string };
      const res = await fetch(url);
      return { content: [{ type: "text", text: await res.text() }] };
    },
  });

  // Set output for routing
  api.phase.setMessage("Phase complete");
  api.phase.setNextPhase("stop");
}
```

---

## How Phases Work

### Lifecycle

```
┌──────────────────────────────────────────────────────────┐
│  Phase Loop (runPhaseLoop)                               │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ 1. Read Agent-normalized `context.phases`           │ │
│  │ 2. Build route tool from available phases           │ │
│  │ 3. Build PhaseContext (filtered tools/skills)       │ │
│  │ 4. Fire `before_phase` hooks (extensions)           │ │
│  │ 5. Execute phase (factory | run | LLM-driven)       │ │
│  │ 6. Extract route from tool calls or output          │ │
│  │ 7. Fire `after_phase` hooks (extensions)            │ │
│  │ 8. Route → next phase, continue, parallel, or stop  │ │
│  └─────────────────────────────────────────────────────┘ │
│         │                                                │
│         ▼ (repeat until route = "stop" or no next phase) │
└──────────────────────────────────────────────────────────┘
```

### Phase Resolution

When the loop resolves the next phase:

1. `phase.target` (from `PHASE.md` frontmatter) — highest priority, forces the next phase
2. `output.route` (from execution result) — the phase decides dynamically
3. `"stop"` — default if nothing else is specified

### Built-in "Default" Phase

If no phases are defined, Rowan runs a single LLM-driven phase named `default` that processes the user prompt with all available tools. User-defined phases in `.rowan/phases/` can override it by defining a phase whose `name` is `default`.

---

## PHASE.md Format

Each phase lives in its own directory under `.rowan/phases/`:

```
.rowan/phases/<phase-name>/
├── PHASE.md     # Required — instructions and configuration
└── index.ts     # Optional — execution code
```

### Frontmatter

```yaml
---
name: my-phase              # Should match the directory name; omitted = directory name
description: What it does   # Required, max 1024 characters
tools: [read, write, bash]  # Restrict available tools (omit = all tools)
skills: [my-skill]           # Restrict available skills (omit = all skills)
target: next-phase           # Force next phase name (overrides route tool)
input:                       # Expected input fields (shown to LLM in route tool)
  task: "The task to perform"
  context: "Additional context"
isolated: true               # Fresh context when executed in parallel
---
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | No | Should match the directory name; mismatch warns but still loads; omitted = directory name |
| `description` | string | Yes | Non-empty, at most 1024 characters; shown in route tool |
| `tools` | string[] | No | Tool names allowed in this phase. `undefined` = all tools |
| `skills` | string[] | No | Skill names available. `undefined` = all skills |
| `target` | string | No | Forced next phase name. Overrides route tool |
| `input` | Record<string, string> | No | Expected payload fields with descriptions |
| `isolated` | boolean | No | Fresh message context in parallel execution |

### Body Content

The markdown body below the frontmatter becomes the phase's system prompt content. It's injected as a user message when the phase executes. Use it to give the LLM detailed instructions, output format requirements, and routing guidance.

```markdown
---
name: review
description: Code review phase
---

You are in the **review** phase. Your job is to review code changes.

## Checklist
- Correctness
- Error handling
- Performance
- Style

## Routing
- Approve: call `route` with `stop`
- Request changes: call `route` with `execute`, include feedback in payload
```

---

## Execution Modes

Rowan supports three execution modes. The loop auto-detects which to use based on what the phase exports.

### 1. LLM-Driven (Default)

No `index.ts` needed. The LLM reads `PHASE.md` content as instructions, uses available tools, and calls the `route` tool when done. This is the most common mode.

```markdown
---
name: analyze
description: Analyze code and produce findings
---

You are in the **analyze** phase...
```

### 2. Run Pattern

Export an async `run` function. Takes full control — the LLM is not invoked. Return a `PhaseOutput` to route.

```typescript
// .rowan/phases/transform/index.ts

export async function run(context, execution) {
  const { payload } = context.state;

  // Your logic here
  const result = await processData(payload);

  return {
    message: `Processed ${result.count} items`,
    route: "verify",          // next phase
    payload: result,           // passed to next phase
  };
}
```

**`run` signature:**

```typescript
type PhaseRun = (
  context: PhaseContext,    // systemPrompt, messages, tools, skills, state, invocation
  execution: PhaseExecution, // execution utilities
) => Promise<PhaseOutput | void>;
```

### 3. Factory Pattern

Export a default function that receives `ExtensionAPI`. Full access to hooks, tools, and phase I/O. Use this when the phase needs to register tools or hooks programmatically.

```typescript
// .rowan/phases/coder/index.ts
import type { ExtensionAPI } from "@rowan-agent/agent";

export default async function(api: ExtensionAPI) {
  // Register a phase-specific tool
  api.registerTool({
    name: "code_edit",
    description: "Edit a file with structured changes",
    parameters: {
      type: "object",
      properties: {
        file: { type: "string" },
        changes: { type: "array", items: { type: "string" } },
      },
    },
    execute: async (args) => {
      // ... implementation
      return { content: [{ type: "text", text: "Done" }] };
    },
  });

  // Hook into tool calls
  api.on("before_tool_call", (event) => {
    if (event.tool.name === "bash") {
      // Log or block commands
    }
    return { allow: true };
  });

  // Set phase output after execution
  api.phase.setMessage("Code changes applied");
  api.phase.setNextPhase("verify");
  api.phase.setPayload({ filesChanged: 3 });
}
```

---

## The Route Tool

Every phase gets a `route` tool injected into its tool list. The LLM uses it to transition between phases.

### Tool Signature

```typescript
{
  decision: Array<{
    phase: string;       // target phase name or "stop"
    reason?: string;     // brief explanation
    payload?: unknown;   // data for the next phase
  }>;
  instruction?: string;  // shared guidance for all targets
}
```

### Single Route

```json
{
  "decision": [{ "phase": "verify", "reason": "Implementation complete" }],
  "instruction": "Review the changes for correctness"
}
```

### Parallel Route

Route to multiple phases concurrently:

```json
{
  "decision": [
    { "phase": "lint", "reason": "Check code style" },
    { "phase": "test", "reason": "Run test suite" }
  ]
}
```

### Stop

End the workflow and return the result to the user:

```json
{
  "decision": [{ "phase": "stop", "reason": "All tasks complete" }]
}
```

### Route Resolution Priority

1. **`phase.target`** — If `PHASE.md` sets `target: verify`, the phase always routes to `verify` regardless of what the LLM calls
2. **`output.route`** — From the execution result (`PhaseOutput.route`)
3. **LLM route tool call** — The model decides
4. **`"stop"`** — Default if nothing else is specified

---

## Parallel Execution

When the `route` tool's `decision` array contains multiple targets, Rowan executes all target phases concurrently.

### Independent Instances (Default)

Each parallel phase runs independently. They don't share message context.

```json
{
  "decision": [
    { "phase": "research", "payload": { "topic": "security" } },
    { "phase": "research", "payload": { "topic": "performance" } }
  ]
}
```

### Isolated Phases

Set `isolated: true` in `PHASE.md` frontmatter to guarantee a fresh context (empty messages) when the phase runs in parallel:

```yaml
---
name: research
description: Research a topic
isolated: true
input:
  topic: "Research topic"
---
```

### Joining Results

When parallel phases complete, the loop collects all their outputs and stashes them. The next iteration's phase entry message surfaces them under `<prev_phase_outputs>`:

```
<phase name="default">
  <content>
    ...
  </content>
  <prev_phase_outputs>
    <instruction>Review the changes for correctness</instruction>
    <phase name="lint#1">
      <errors>2</errors>
    </phase>
    <phase name="typecheck">
      <ok>true</ok>
    </phase>
  </prev_phase_outputs>
</phase>
```

The `<instruction>` field appears only when the `route` tool call included one (shared guidance for all targets). The `<phase name="...">` entries use the parallel instance name: unique phases get the plain name (`lint`), duplicates get `lint#1`, `lint#2`, etc. The entry phase can then `route` onward (e.g. to `stop`).

### Invocation Metadata

Every `PhaseContext` includes an `invocation` discriminated union. A serial phase receives its current phase name as `instanceId`:

```typescript
{
  mode: "serial",
  instanceId: "review",
}
```

Parallel phases additionally receive batch metadata:

```typescript
{
  mode: "parallel",
  instanceId: "review#1",
  groupId: "phase-group_12345678",
  index: 0,
  count: 2,
  sourcePhaseId: "dispatch",
}
```

All invocations in one parallel dispatch share the same opaque `groupId`. `index` is the zero-based position in the route decision array, `count` is the number of decisions in that batch, and `sourcePhaseId` identifies the phase that dispatched the batch. Narrow on `invocation.mode` before reading parallel-only fields.

---

## Inter-Phase Data

### Payload

Phases pass structured data to each other via `payload`:

**Sender** (phase output):

```typescript
return {
  message: "Analysis complete",
  route: "summarize",
  payload: {
    files: ["src/a.ts", "src/b.ts"],
    issues: [{ severity: "high", message: "null dereference" }],
  },
};
```

**Receiver** (phase input):

```typescript
export async function run(context) {
  const { files, issues } = context.state.payload;
  // ...
}
```

The LLM also sees payload data in the route tool's `input` field descriptions, so it can pass relevant structured data between phases.

### State

`PhaseState` tracks the loop position:

```typescript
interface PhaseState {
  current: string;       // current phase name
  available: string[];   // all phase names in registry
  iterations: number;    // how many times this phase has looped
  payload?: unknown;     // data from previous phase
}
```

---

## Reloading File Phases

The durable Runtime does not read phase files automatically. Load them with the standalone `loadPhases()` helper and include the resulting `PhaseRegistry` in `AgentConfig.context.phases`. The Runtime merges that registry with its built-in `"default"` phase for each execution; configured Extensions are assembled at the same seam.

To pick up file edits, call `loadPhases()` again and create a new immutable configuration snapshot with the refreshed registry. Existing Runs continue using their pinned configuration token.

---

## API Reference

### Phase

The loaded phase object.

```typescript
interface Phase {
  name: string;                        // unique identity and display name
  description: string;                 // shown in route tool
  tools?: string[];                    // restricted tools (undefined = all)
  skills?: string[];                   // restricted skills (undefined = all)
  target?: string;                     // forced next phase
  input?: Record<string, string>;      // expected input fields
  isolated?: boolean;                  // fresh context in parallel
  filePath: string;                    // path to PHASE.md
  baseDir: string;                     // phase directory
  content: string;                     // PHASE.md body
  factory?: (api: ExtensionAPI) => Promise<void>;
  run?: (context: PhaseContext, execution: PhaseExecution) => Promise<PhaseOutput | void>;
}
```

### PhaseContext

What a phase receives to execute.

```typescript
interface PhaseContext {
  systemPrompt: string;        // current system prompt
  messages: AgentMessage[];    // conversation history
  tools: Tool[];               // phase-filtered tools
  skills: Skill[];             // phase-filtered skills
  state: PhaseState;           // { current, available, iterations, payload }
  readonly invocation: PhaseInvocation;
  promptGuidelines?: string[];
  appendSystemPrompt?: string;
}
```

```typescript
type PhaseInvocation =
  | {
      mode: "serial";
      instanceId: string;
    }
  | {
      mode: "parallel";
      instanceId: string;
      groupId: string;
      index: number;
      count: number;
      sourcePhaseId: string;
    };
```

### PhaseOutput

What a phase returns.

```typescript
type PhaseOutput = {
  message: string;                     // outcome message
  route: string;                       // next phase name, "continue", or "stop"
  phase?: string;                      // phase name (auto-filled)
  toolCalls?: Array<{ id: string; name: string; args: unknown }>;
  routeReason?: string;                // from route tool call
  payload?: unknown;                   // data for next phase
};
```

### PhaseRegistry

Collection of all loaded phases.

```typescript
interface PhaseRegistry {
  phases: Map<string, Phase>;
  entryPhaseId: string | null;  // null until Agent normalizes to "default"
}
```

### Loading Functions

```typescript
// Load phases from a PHASE.md file or directory
loadPhases(targetPath: string): Promise<PhaseRegistry>
```

Pass the loaded `PhaseRegistry` into `AgentConfig.context.phases`:

```typescript
const phases = await loadPhases("./.rowan/phases");
const agentId = await runtime.createAgent({
  identity: "workspace-v1",
  context: { ...baseContext, phases },
  model,
  stream,
});
const run = await runtime.start(agentId, "Run the workflow", {
  idempotencyKey: "start-run",
});
```

---

## Examples

### Plan → Execute → Verify Workflow

**`.rowan/phases/plan/PHASE.md`**

```yaml
---
name: plan
description: Create a task plan from the user's request
input:
  task: "The user's request"
  context: "Additional constraints"
---
```

**`.rowan/phases/execute/PHASE.md`**

```yaml
---
name: execute
description: Implement the task plan
tools: [read, write, edit, bash]
---
```

**`.rowan/phases/verify/PHASE.md`**

```yaml
---
name: verify
description: Review execution results
target: stop
---
```

The LLM in the `plan` phase creates a plan, routes to `execute`. The `execute` phase implements it, routes to `verify`. The `verify` phase reviews results and either routes back to `execute` with feedback or stops.

### Image Generation Phase

A real-world phase with code — `.rowan/phases/image-gen/`:

```
.rowan/phases/image-gen/
├── PHASE.md     # Instructions, input schema (prompt, width, height, filename)
└── index.ts     # Pollinations API integration, downloads and saves images
```

The `PHASE.md` defines the expected inputs; the `index.ts` `run` function handles the actual API call, file saving, and returns the result as `PhaseOutput`.
