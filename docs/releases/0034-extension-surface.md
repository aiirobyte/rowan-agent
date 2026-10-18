# Rowan Agent 0.30.0 — Unified Extension Surface and Extension Phases

## Two entry points

Rowan Agent now exposes two cleanly separated entry points:

- `@rowan-agent/agent` (`.`): The authoring surface for Extensions and code Phases. Everything an Extension or Phase needs (`ExtensionAPI`, `ExtensionFactory`, `ExtensionDisposer`, hook events and handlers, `ToolDefinition`, `Phase`, `PhaseContext`, `PhaseExecution`, `PhaseOutput`, `InternalModelLoopOptions`, Settings types, `ScopeRef`, JSON types, run-interaction types, and record/message/id types surfaced by `api.agents`). Individual model types are now reached as `models.X` through `export * as models from "@rowan-agent/models"`.
- `@rowan-agent/agent/runtime` (`./runtime`): The host-embedding surface for hosts embedding the agent runtime (`AgentRuntime`, `InMemoryStore`, `SqliteStore`, `ResourceRegistry`, config providers, extension host/lifetime, loaders, core phase/tool factories, errors, durable record/cursor types).

Each name is exported from exactly one entry point.

## One clean `api`

The `ExtensionAPI` surface has been streamlined into a single, cohesive interface:

| Namespace | Members | Purpose |
|---|---|---|
| `hooks` | `on`, `off` | Subscribe and unsubscribe to lifecycle and execution hooks |
| `config` | `get`, `changed` | Read layered extension config and listen for updates |
| `state` | `run`, `agent`, `global` | Scoped in-memory or durable state access |
| `tools` | `register`, `unregister` | Register and unregister LLM-callable tools |
| `skills` | `register`, `unregister` | Register and unregister standalone skills |
| `phases` | `register`, `unregister`, `execute` | Register/unregister phases and define Extension Phase execution |
| `models` | `registerProvider`, `unregisterProvider` | Register and unregister model providers (replaces `providers.*`) |
| `agents` | `list()`, `history(agentId)`, `contextStatus(agentId)`, `runs(agentId, filter?)`, `runPhase(agentId, options)`, `consume(consumerId, onEvent)` | Delegate to the host `AgentRuntime`; `consume` is durable and checkpointed |
| `events` | `on`, `off`, `emit`, `has`, `count` | Inter-extension event bus |
| `capabilities` | `contribute` | Advertise capabilities to the host |
| `context` | `cwd`, `signal`, `exec` | Execution environment context |

Removed from `ExtensionAPI`:
- `utils` (`createId`, `formatJson`)
- `manifest` at the api level
- `phases.getPayload`, `setPayload`, `setMessage`, `getCurrentPhase`, `setNextPhase`, `getNextPhase`, `getMessage`
- Stub-only `context` members (`isIdle`, `abort`, `modelId`, `getSystemPrompt`, `setSystemPrompt`, `getMessages`, `addMessage`, `getAvailableTools`, `getAvailableSkills`, `getPhaseContent`, `getAvailablePhases`)

## Extension Phases

A Phase's `index.ts`/`index.js` may export `run(context, execution)` (the simple programmatic form) or a default `ExtensionFactory` (an **Extension Phase**), but not both:

- An Extension Phase factory is activated once per Scope in which the Phase is available, using the same lifetime as other Extensions (host `extendApi` applies; disposers run on unload/reload).
- Inside the factory, `api.phases.execute(handler)` sets the Phase's execution handler, with the same `(context, execution) => PhaseOutput` contract as `run`.
- Calling `api.phases.execute` outside an Extension Phase throws.
- An Extension Phase whose factory sets no handler runs as a model Phase.
- The old per-execution factory path and `Phase.factory` are deleted.

## Migration Table

| Old | New | Notes |
|---|---|---|
| `import { AgentRuntime } from "@rowan-agent/agent"` | `import { AgentRuntime } from "@rowan-agent/agent/runtime"` | Host runtime moved to `./runtime` subpath |
| `import { InMemoryStore, SqliteStore } from "@rowan-agent/agent"` | `import { InMemoryStore, SqliteStore } from "@rowan-agent/agent/runtime"` | Durable stores moved to `./runtime` |
| `import { loadPhases, loadSkills, loadExtensions } from "@rowan-agent/agent"` | `import { loadPhases, loadSkills, loadExtensions } from "@rowan-agent/agent/runtime"` | Loaders moved to `./runtime` |
| `import { createCoreTools, createCorePhases } from "@rowan-agent/agent"` | `import { createCoreTools, createCorePhases } from "@rowan-agent/agent/runtime"` | Core resources moved to `./runtime` |
| `import { ModelRef, StreamFn, ThinkingLevel } from "@rowan-agent/agent"` | `import { models } from "@rowan-agent/agent"; models.ModelRef` | Re-exported model types accessed via `models.*` |
| `api.providers.register(config)` | `api.models.registerProvider(config)` | Provider registration unified under `models` |
| `api.providers.unregister(id)` | `api.models.unregisterProvider(id)` | Provider removal unified under `models` |
| `api.phases.setMessage(...)`, `setNextPhase(...)` | `api.phases.execute(async (ctx, exec) => ({ message, route }))` | Extension Phases set explicit execution handler |
| `api.phases.getPayload()` | `context.state.payload` in `execute` handler | Phase payload read directly from `PhaseContext` |
| `api.utils.createId(...)`, `api.utils.formatJson(...)` | Use standard `crypto.randomUUID()` / `JSON.stringify()` | Utility namespace removed |
| `api.context.getMessages()`, `addMessage()` | Use `api.agents.history()` or `execution.messages` | Stubbed context helpers removed |
| `phase.factory` in Phase bundle | `export default function(api: ExtensionAPI)` + `api.phases.execute(...)` | Extension Phase activated once per Scope |

## `@rowan-agent/models` exports only its contract

`@rowan-agent/models` now lists its exports explicitly (20 values, 59 types): the protocol, content, tool, and JSON types; model and provider configuration; the model and API-provider registries; streaming; and `ProviderError`. Provider internals — parsing and transport helpers, each provider's own config resolvers and stream functions, `ServerSentEvent`, and the test-only resets `clearModels` / `clearApiProviders` — are no longer exported. A build-time check verifies the list.

## Packages

- `@rowan-agent/agent` 0.30.0
- `@rowan-agent/models` 0.11.0
