# Extensions

Extensions are loaded before an `AgentRuntime` Run and can register phases,
Tools, model providers, and execution hooks. They do not own Agent identity,
Run persistence, or lifecycle state.

## Extension factory

```ts
import type { ExtensionFactory } from "@rowan-agent/agent";

const extension: ExtensionFactory = (api) => {
  api.registerTool({
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

  api.registerPhase({
    name: "review",
    description: "Review the current request.",
    tools: ["search_docs"],
  });

  api.on("before_tool_call", ({ tool, args }) => {
    if (tool.name === "search_docs" && !args) {
      return { allow: false, reason: "query is required" };
    }
    return { allow: true };
  });
};

export default extension;
```

## API

- `registerTool(tool)`: Register a tool that the LLM can call.
- `registerPhase(phase)`: Register an execution phase that can be routed to.
- `registerProvider(provider)` / `unregisterProvider(id)`: Register or remove
  a model provider configuration.
- `on()` / `off()`: Register `before_phase`, `after_phase`, `before_prompt`,
  `before_tool_call`, and `after_tool_call` hooks.
- `context`: Access the working directory, `AbortSignal`, command execution,
  and the current resource summary.
- `phase`: Read or set the current phase payload, output messages, and next
  destination.
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
