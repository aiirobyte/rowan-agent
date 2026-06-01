# Phase Extension Event-Driven Refactor

Status: Proposed

## Context

ADR-0014 introduced the extension system with `PhaseRegistration` as a fat struct: each phase bundles `run`, `buildPrompt`, `createOutcome`, `prepare`, `finalize` into one object. In practice, most of these functions are boilerplate — `buildPrompt` follows an identical pattern across all four built-in phases, and `createOutcome` is usually a trivial mapping.

Pi's extension system takes a different approach: extensions subscribe to events via `pi.on("event", handler)` and register resources via `pi.registerTool(...)`. Extensions only implement what they need. There is no "phase struct" — the framework owns the lifecycle, extensions inject behavior at event points.

Rowan should adopt this philosophy while keeping its phase graph as the routing mechanism. The key insight is:

- **Framework owns the phase loop**: input preparation, model invocation, output assembly, routing
- **Extension owns the behavior**: what to do when a phase activates, how to process results, what tools to call
- **Phase is an event subscription point**, not a self-contained execution unit

## Decision

Refactor `PhaseRegistration` from a fat struct to a lightweight declaration. The framework provides a standard phase loop; phases customize behavior through configuration and event hooks on the ExtensionAPI.

## PhaseOutput Contract

Every Phase must produce a `PhaseOutput` when it ends. This is the framework's return to the user.

```typescript
type PhaseOutput = {
  message: string;    // Message returned to the user
  route: string;      // Next phase (or "stop")
  yield?: unknown;    // Data passed to the next phase
};
```

Model interactions and tool calls inside a phase are intermediate steps — they do not produce an Outcome. The framework assembles the PhaseOutput at phase exit.

If the phase's `run` returns void, the framework falls back to:

```typescript
const output: PhaseOutput = result ?? {
  message: lastModelMessage,   // Auto-collected from the most recent model response
  route: "stop",
};
```

## Phase Registration Interface

```typescript
type PhaseRegistration = PhaseManifest & {
  /** Declarative prompt config — framework generates buildPrompt from this */
  prompt?: PhasePromptConfig;

  /** Optional execution override — takes over model invocation at step 4 */
  run?: (context: PhaseContext, input: PhaseInput) => Promise<PhaseOutput | void>;

  /** Custom prompt builder — overrides prompt config if provided */
  buildPrompt?: (input: PhaseInput, options?: { toolResults?: ToolResult[] }) => LlmRequest;
};

type PhasePromptConfig = {
  sections: PhaseSection[];
  withToolResults?: boolean;
};
```

Compared to ADR-0014's `ExtensionPhaseHandler`, removed:
- `prepare` — phase calls utility functions inside `run`
- `finalize` — phase calls utility functions inside `run`
- `createOutcome` — framework assembles directly from PhaseOutput
- `buildInput` — framework prepares automatically (removed in prior refactor)

## Phase Loop

The framework's phase loop always executes. Extension event hooks are always active — they fire regardless of whether a phase provides `run`. The `run` function is an optional override point that takes over step 4 (model invocation).

```
Phase Loop (always executed by framework):

  1. Framework builds PhaseInput (from state + yield)

  2. beforePhase hooks        ← extension hooks always fire

  3. beforePrompt hooks       ← extension hooks always fire
     Framework builds LLM request from phase.prompt or phase.buildPrompt

  4. ┌─ run provided    → phase.run(context, input) takes over
     │                    (can call model, execute tools, loop, modify state)
     └─ no run          → framework calls model.collect({ input })

  5. Framework assembles PhaseOutput
     (run result ?? { message: lastModelMessage, route: "stop" })

  6. afterPhase hooks         ← extension hooks always fire

  7. Framework routes to next phase via output.route
```

Without `run`, an extension still executes through its event hooks:

```typescript
const myExtension = defineExtension((api) => {
  // No run — but these hooks still execute
  api.beforePhase((ctx) => { /* modify input */ });
  api.beforePrompt((ctx) => { /* transform prompt */ });
  api.afterPhase((ctx) => { /* process output */ });
  api.beforeToolCall((ctx) => { /* intercept tool calls */ });
  api.on("agent_start", () => { /* listen to events */ });
});
```

With `run`, the phase takes full control of step 4:

```typescript
async run(context, input) {
  const collected = await api.model.collect(context, input);   // call model
  const results = await api.tools.execute(collected.toolCalls); // execute tools
  const verify = await api.model.collect(context, { ...input, yield: { results } }); // nested call
  return { message: verify.text, route: "stop", yield: { results } };
}
```

## ExtensionAPI

ExtensionAPI provides all capabilities a phase needs at runtime:

```typescript
type ExtensionAPI = {
  // Registration
  registerPhase(registration: PhaseRegistration): void;

  // Event hooks
  beforePhase(hook: (ctx: BeforePhaseHookContext) => void | Promise<void>): void;
  afterPhase(hook: (ctx: AfterPhaseHookContext) => void | Promise<void>): void;
  beforePrompt(hook: (ctx: BeforePromptHookContext) => void | Promise<void>): void;
  beforeToolCall(hook: (ctx: BeforeToolCallContext) => void | Promise<void>): void;
  afterToolCall(hook: (ctx: AfterToolCallContext) => void | Promise<void>): void;
  on(event: string, handler: ExtensionHandler): void;

  // Provider
  registerProvider(config: ProviderConfig): void;
  unregisterProvider(name: string): void;

  // Utilities
  exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
  id: { create(prefix: string): string };
  format: { json(value: unknown): string };
  input: { latestUserMessage(input: PhaseInput): string };
  prompt: {
    buildModelRequest(input: PhaseInput, options?: { toolResults?: ToolResult[] }): LlmRequest;
    buildPhaseContent(input: PhaseInput, sections: PhaseSection[]): string;
  };
};
```

## Built-In Phase Refactor

### Chat Phase

Current ~75 lines → ~25 lines after refactor:

```typescript
rowan.registerPhase({
  id: "chat",
  name: "Chat",
  description: "Direct conversation.",
  prompt: {
    sections: [
      { type: "instructions", lines: [
        "Answer the user's question directly in natural language.",
        "If the request requires tool access, call the available tools.",
        "Do NOT output JSON. Respond in the user's language.",
      ]},
      { type: "userRequest" },
    ],
  },
  async run(context, input) {
    const collected = await context.model.collect({ input });
    if (collected.toolCalls.length > 0) {
      return { message: "Executing tools.", route: "execute", yield: { toolResults: [] } };
    }
    return { message: collected.text, route: "stop" };
  },
});
```

### Plan Phase

Current ~85 lines → ~40 lines after refactor:

```typescript
rowan.registerPhase({
  id: "plan",
  name: "Plan",
  description: "Create a task plan.",
  prompt: {
    sections: [
      { type: "instructions", lines: [
        "Analyze the user's request and create a task plan.",
        'Output a JSON object: { "task": { ... }, "message": "explanation" }',
        // ...
      ]},
      { type: "userRequest" },
      { type: "tools" },
    ],
  },
  async run(context, input) {
    const collected = await context.model.collect({ input });
    const raw = JSON.parse(collected.text);
    const task = normalizeTask(raw?.task ?? raw);
    return { message: raw?.message ?? "", route: "execute", yield: { task } };
  },
});
```

### Execute Phase

Current ~87 lines → ~40 lines after refactor:

```typescript
rowan.registerPhase({
  id: "execute",
  name: "Execute",
  description: "Execute task tools.",
  prompt: {
    sections: [
      { type: "instructions", lines: [
        "Execute the task by calling the appropriate tools.",
        "If more tool calls are needed, continue calling tools.",
        "If execution is complete, respond with a brief summary.",
        "Do NOT output JSON. Use the provided tools directly.",
      ]},
      { type: "task" },
      { type: "tools" },
    ],
    withToolResults: true,
  },
  async run(context, input) {
    context.incrementAttempt();
    const collected = await context.model.collect({ input });
    return { message: collected.text, route: "verify", yield: { toolResults: [] } };
  },
});
```

### Verify Phase

Current ~113 lines → ~50 lines after refactor:

```typescript
rowan.registerPhase({
  id: "verify",
  name: "Verify",
  description: "Verify task output.",
  prompt: {
    sections: [
      { type: "instructions", lines: [
        "Review the task output against the acceptance criteria.",
        "If the criteria are met, respond with a confirmation.",
        "If more work is needed, call tools to fix issues.",
        "Do NOT output JSON.",
      ]},
      { type: "task" },
      { type: "taskOutput" },
    ],
  },
  async run(context, input) {
    const maxAttempts = context.maxAttempts ?? 2;
    const collected = await context.model.collect({ input });

    if (collected.toolCalls.length > 0) {
      if (context.state.attempt >= maxAttempts) {
        return { message: "Fix attempted.", route: "stop", yield: { task, passed: true } };
      }
      return { message: "Fixing issues.", route: "execute", yield: { task } };
    }

    const passed = !/fail|error|issue/i.test(collected.text);
    const route = passed ? "stop" : (context.state.attempt >= maxAttempts ? "stop" : "execute");
    return { message: collected.text, route, yield: { task, passed } };
  },
});
```

## File Change List

| File | Change |
|------|--------|
| `extensions/types.ts` | Add `PhasePromptConfig`; refactor `PhaseRegistration` to remove `prepare`/`finalize`/`createOutcome` |
| `extensions/runner.ts` | `registerPhase` generates `buildPrompt` from `prompt` config |
| `loop/phases/registry.ts` | Simplify `PhaseHandler`; make `PhaseOutput.route` required |
| `agent-loop.ts` | Refactor phase loop: `run` as optional override at step 4, auto-assemble PhaseOutput |
| `built-in/chat/index.ts` | Replace full implementation with `prompt` + simplified `run` |
| `built-in/plan/index.ts` | Replace full implementation with `prompt` + simplified `run` |
| `built-in/execute/index.ts` | Replace full implementation with `prompt` + simplified `run` |
| `built-in/verify/index.ts` | Replace full implementation with `prompt` + simplified `run` |
| Test files | Update `registerPhase` calls |

## Implementation Steps

| # | Step | Risk |
|---|------|------|
| 1 | Add `PhasePromptConfig` type | Low |
| 2 | Refactor `PhaseRegistration`: remove `prepare`/`finalize`/`createOutcome`, add `prompt` | Medium |
| 3 | runner.ts: generate `buildPrompt` from `prompt` config in `registerPhase` | Low |
| 4 | agent-loop.ts: implement phase loop with `run` as optional step-4 override, auto-assemble PhaseOutput | High |
| 5 | Refactor four built-in phases | Medium |
| 6 | Update tests | Medium |

## Consequences

Phase registration changes from a fat struct to a lightweight declaration. Extensions only need to care about two things: what the phase is (prompt config) and what the phase does (run logic). Output assembly, routing, and input preparation are all handled by the framework.

Built-in phase code drops from ~360 lines to ~155 lines, with each phase containing only its unique logic.

The `run` function is an optional override — it takes over model invocation when provided, with full freedom to call models, execute tools, loop, and modify state. Without it, the framework executes the standard flow, and extension event hooks still fire at every lifecycle point.
