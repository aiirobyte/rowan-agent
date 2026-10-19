# Extensions

Extensions are loaded before an `AgentRuntime` Run and can register phases,
skills, Tools, model providers, and execution hooks. They do not own Agent identity,
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

The factory may return a cleanup function (sync or async). Return one only for
resources the Extension owns itself (processes, timers, sockets); registrations
(tools, phases, skills, providers, hooks, events, consumers, config listeners)
are removed by Rowan when the Extension is disposed.

## API

- `config.get(scope?)` / `config.changed(handler)`: Read the extension's own
  effective configuration block resolved across the host layer chain (`ScopeRef`:
  `readonly { kind: string; id: string }[]`, with `[]` representing global scope),
  and listen for configuration change events.
- `state.run(runId)`: Access in-memory key-value state private to the extension
  for a specific run. Run state is dropped when the run ends.
- `state.agent(agentId)`: Access durable key-value state private to the
  extension for a specific agent, persisted via the host.
- `state.global()`: Access extension-wide durable key-value state private to the
  extension, surviving process restarts and not tied to an Agent, persisted via the host.
- `tools.register(tool, scope?)` / `tools.unregister(toolName, scope?)`: Register or remove a tool that the LLM can call.
  Registrations without scope are Global (`rowan.extensions`), while scoped registrations are stored under `rowan.extensions:<scopeToKey(scope)>`; `extensionSourceId(scope)` returns that source id.
  Extension sources are resolved explicitly by Resource Views rather than auto-attached.
  Tools can specify `kind`, `annotations`, MCP-standard `_meta?: JsonObject` (passed untouched to `tools.list()` summaries for hosts and i18n), and an optional pure presentation function:
  ```ts
  present?(call: {
    status: ToolCallStatus;
    args: JsonValue;
    progress?: ToolProgress;
    result?: ToolResult;
  }): { title?: string; content?: ToolCallContent[]; locations?: ToolCallLocation[]; _meta?: JsonObject } | void | Promise<...>;
  ```
  Rowan calls `present` at call reservation (`pending`), start of execution (`in_progress`), on each progress report via `ctx.reportProgress(progress)` (`status: "in_progress", progress`), and on completion/failure (`status: "completed" | "failed", result`). Outputs are merged using `mergeToolCall`. When omitted or on error, Rowan falls back to default presentation without failing the tool call.
  During execution, tools report progress using `context.reportProgress(progress: ToolProgress)` (`{ progress: number; total?: number; message?: string; _meta?: JsonObject }` matching MCP standard). Shape is validated (finite numbers); invalid reports are dropped with a warning without failing the tool. Tool-private progress data goes under `_meta` keys. Continuous output must be reported cumulatively (e.g. a tail), because transient updates coalesce per `toolCallId`.
- `models.registerProvider(config)` / `models.unregisterProvider(id)`: Register or remove
  a model provider configuration. Registering with an existing ID replaces it.
- `phases.register(path | Phase, scope?)` / `phases.unregister(phaseName, scope?)` / `phases.execute(handler)`: Load and register a Phase directory Bundle or programmatic Phase object (Global or scoped). Inside an Extension Phase, `phases.execute(handler)` sets the execution handler.
- `skills.register(path | Skill, scope?)` / `skills.unregister(skillName, scope?)`: Load and register a standalone Skill directory (containing `SKILL.md`) or a Skill object (Global or scoped). Registering an existing name replaces it. Unregistering removes it from the resource pool.
- `agents`: Interact with the AgentRuntime:
  - `agents.list()`: List agents managed by the runtime.
  - `agents.history(agentId)`: Read committed transcript messages.
  - `agents.contextStatus(agentId)`: Query context window token usage.
  - `agents.runs(agentId, filter?)`: List runs for an agent.
  - `agents.run(runId)`: One Run in full (`RunSnapshot`), including its outcome once it ended.
  - `agents.runPhase(agentId, options)`: Trigger a Control Run for a phase.
  - `agents.consume(consumerId, onEvent)`: Durable, checkpointed event consumer that automatically stops on extension disposal.
- `hooks.on(type, handler)`: Register lifecycle hooks (`run_start`, `run_end`) and
  execution hooks (`before_phase`, `after_phase`, `before_prompt`,
  `before_tool_call`, and `after_tool_call`). Returns an unsubscribe function
  (`const off = api.hooks.on(...)`). Tool-call hooks receive execution
  `scope` and per-turn input `turn`; `before_tool_call` also carries the invoking
  Agent's `agentMetadata` beside the Run's `metadata`. Both hooks carry
  `phase?: ToolCallPhase` (`{ name, metadata? }`): the Phase that issued the
  call and its extra PHASE.md frontmatter.
- `context`: Access the working directory (`cwd`), `signal` (`AbortSignal`), and command execution (`exec`).
- `events.on(event, listener)` / `events.emit(event, ...args)`: Publish custom events between extensions. `on` returns an unsubscribe function.

## Loading

```ts
import { loadExtensions, AgentRuntime } from "@rowan-agent/agent/runtime";
import type { ExtensionFactory } from "@rowan-agent/agent";

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
import { AgentRuntime, InMemoryExtensionHost } from "@rowan-agent/agent/runtime";

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
- `getGlobalState(extensionId, key)`, `setGlobalState(extensionId, key, value)`, `deleteGlobalState(extensionId, key)`: Manages extension-wide durable state.
- `extendApi(extensionId)`: Injects host-defined API namespaces into that extension's `api` object during load, with an optional `dispose()` callback when the extension is unloaded, reloaded, or fails activation.

Hosts dispatch their own UI actions; Rowan has no UI action channel.
