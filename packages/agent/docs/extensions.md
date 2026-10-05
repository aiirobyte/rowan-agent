# Extensions

Extensions are loaded before an `AgentRuntime` Run and can register phases,
Tools, model providers, and execution hooks. They do not own Agent identity,
Run persistence, or lifecycle state.

## Extension factory

```ts
import type { ExtensionFactory } from "@rowan-agent/agent";

const extension: ExtensionFactory = async (api) => {
  api.tools.register({
    name: "search_docs",
    description: "Search project documentation.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
    execute: async (args) => ({
      content: [{ type: "text", text: `query: ${String(args)}` }],
    }),
  });

  await api.phases.register("./review-phase");

  api.hooks.on("before_tool_call", ({ tool, args }) => {
    if (tool.name === "search_docs" && !args) {
      return { allow: false, reason: "query is required" };
    }
    return { allow: true };
  });
};

export default extension;
```

## API

- `config.get(scope?)` / `config.changed(handler)`: Read the extension's own
  effective configuration block resolved across the host layer chain (`ScopeRef`:
  `readonly { kind: string; id: string }[]`, with `[]` representing global scope),
  and listen for configuration change events.
- `state.run(runId)`: Access in-memory key-value state private to the extension
  for a specific run. Run state is dropped when the run ends.
- `state.agent(agentId)`: Access durable key-value state private to the
  extension for a specific agent, persisted via the host.
- `tools.register(tool)` / `tools.unregister(toolName)`: Register or remove a tool that the LLM can call.
  Tools can specify `kind`, `annotations`, MCP-standard `_meta?: JsonObject` (passed untouched to `tools.list()` summaries for hosts and i18n), and an optional pure presentation function:
  ```ts
  present?(call: {
    status: ToolCallStatus;
    args: JsonValue;
    progress?: ToolProgress;
    result?: ToolExecutionResult;
  }): { title?: string; content?: ToolCallContent[]; locations?: ToolCallLocation[]; _meta?: JsonObject } | void | Promise<...>;
  ```
  Rowan calls `present` at call reservation (`pending`), start of execution (`in_progress`), on each progress report via `ctx.reportProgress(progress)` (`status: "in_progress", progress`), and on completion/failure (`status: "completed" | "failed", result`). Outputs are merged using `mergeToolCall`. When omitted or on error, Rowan falls back to default presentation without failing the tool call.
  During execution, tools report progress using `context.reportProgress(progress: ToolProgress)` (`{ progress: number; total?: number; message?: string; _meta?: JsonObject }` matching MCP standard). Shape is validated (finite numbers); invalid reports are dropped with a warning without failing the tool. Tool-private progress data goes under `_meta` keys. Continuous output must be reported cumulatively (e.g. a tail), because transient updates coalesce per `toolCallId`.
- `capabilities.contribute({ kind: "tool", name, description })`: Contribute a
  capability (such as a tool) to the host. Returns a disposer function to remove
  the contribution. Contributions are automatically removed when the extension is
  disposed.
- `providers.register(config)` / `providers.unregister(id)`: Register or remove
  a model provider configuration. Registering with an existing ID replaces it.
  Provider stream functions receive a `ProviderCallContext` with `signal`, `run` metadata,
  `interact()`, and `tools`:
  - `tools.list()`: Inspect registered tools and their MCP-standard `_meta`.
  - `tools.call(name, args, options?)`: Invoke a registered tool. Accepts `options`:
    - `signal?: AbortSignal`: Aborts that single tool call without cancelling the Run.
    - `onUpdate?(toolCall: ToolCall, progress?: ToolProgress): void`: Receives the merged `ToolCall` on every state change (start, progress-driven `present` updates, final state). Passes the raw `progress` object when triggered by a progress report.
  - `tools.report(update)`: Report external tool execution states and progress.
- `phases.register(path | Phase)` / `phases.unregister(phaseName)`: Load and register a Phase directory Bundle or programmatic Phase object. The
  directory contains `PHASE.md` and may contain direct child Skill Bundles. Also provides
  `getPayload`, `setPayload`, `setMessage`, `getCurrentPhase`, `setNextPhase`, `getNextPhase`, `getMessage`.
- `ui.contribute(contribution)`: Contribute declarative UI elements (`settings`, `model-picker`).
- `hooks.on()` / `hooks.off()`: Register lifecycle hooks (`run_start`, `run_end`) and
  execution hooks (`before_phase`, `after_phase`, `before_prompt`,
  `before_tool_call`, and `after_tool_call`). Tool-call hooks receive execution
  `scope` and per-turn input `turn`.
- `context`: Access the working directory, `AbortSignal`, command execution,
  and the current resource summary.
- `events`: Publish custom events between extensions.

## Loading

```ts
import { loadExtensions, AgentRuntime } from "@rowan-agent/agent";

const { extensions, errors } = await loadExtensions(".rowan/extensions");
const runtime = await AgentRuntime.init({ store, configs });
const agentId = await runtime.createAgent({
  ...config,
  extensions,
});
```

Extension contexts are invalidated after loading or reloading. Do not retain
stale `ExtensionAPI` references across runtime boundaries.

## Hook principles

Hooks are only used to modify decisions for the current execution. Durable run
events are not delivered through extension hooks. Read them using
`run.observe()` or `runtime.consume()`; the durable store is responsible for
ordering and replay.

## Host integration

Hosts integrate with extensions by providing an `ExtensionHost` implementation to
`AgentRuntime.init({ host })`. Rowan provides `InMemoryExtensionHost` as the
default in-memory host when `host` is omitted.

```ts
import { AgentRuntime, InMemoryExtensionHost } from "@rowan-agent/agent";

const host = new InMemoryExtensionHost({
  configs: {
    "": {
      "my-extension": { apiKey: "secret" },
    },
  },
});

const runtime = await AgentRuntime.init({ host, store });
```

The host interface defines:
- `getConfig(extensionId, scope?)`: Resolves the layered configuration for an extension.
- `onConfigChanged(listener: (extensionId, scope) => void)`: Registers a listener to receive configuration change notifications for extensions.
- `getAgentState(extensionId, agentId, key)`, `setAgentState(extensionId, agentId, key, value)`, `deleteAgentState(extensionId, agentId, key)`: Manages durable agent-level state.

Hosts can query and listen to capabilities and UI contributions directly on `AgentRuntime`:
- `runtime.listCapabilities()`: Returns the active array of capabilities (`{ extensionId, kind: "tool", name, description }`), readable at any time outside a Run.
- `runtime.onCapabilitiesChanged(listener: (capabilities) => void)`: Subscribes to capability changes and returns an unsubscribe function.
- `runtime.listUiContributions()`: Returns the active array of declarative UI contributions (`UiContribution`), readable at any time outside a Run.
- `runtime.onUiContributionsChanged(listener: (contributions) => void)`: Subscribes to UI contribution changes and returns an unsubscribe function.
- `runtime.triggerUiAction({ contributionId, actionId, scope })`: Dispatches a UI action event (`ui.action`) to the contributing extension.
