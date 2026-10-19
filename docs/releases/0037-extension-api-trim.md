# Rowan Agent 0.33.0 — Extension API trim

Rowan already removes everything an Extension registers when it is disposed, so the Extension API no longer carries parallel ways to undo, announce or dispatch.

## Removed

- `ExtensionDisposer` and `ExtensionFactoryResult`. `ExtensionFactory` is now `(api) => void | (() => void | Promise<void>) | Promise<...>`. Return a cleanup function only for resources the Extension owns itself; registrations (tools, phases, skills, providers, hooks, events, consumers, config listeners) are removed by Rowan.
- `api.hooks.off`. `api.hooks.on` returns an unsubscribe function.
- `api.events.off`, `api.events.has`, `api.events.count` (`off(event)` wiped other Extensions' listeners). `EventBus` is now just `on` (returns unsubscribe) and `emit`.
- UI actions: `runtime.triggerUiAction` and the `"ui.action"` event. Hosts dispatch their own UI actions.
- Capabilities: `api.capabilities.contribute`, `runtime.listCapabilities`, `runtime.onCapabilitiesChanged`, and the types `ExtensionCapability`, `ExtensionCapabilityContribution`, `ExtensionToolContribution`.

## Surface

| Namespace | Members |
|---|---|
| `hooks` | `on` (returns unsubscribe) |
| `config` | `get`, `changed` |
| `state` | `run`, `agent`, `global` |
| `tools` | `register`, `unregister` |
| `skills` | `register`, `unregister` |
| `phases` | `register`, `unregister`, `execute` |
| `models` | `registerProvider`, `unregisterProvider` |
| `agents` | `list`, `history`, `contextStatus`, `runs`, `run`, `runPhase`, `consume` |
| `events` | `on` (returns unsubscribe), `emit` |
| `context` | `cwd`, `signal`, `exec` |

## Migration

- Factory cleanup: return a cleanup function or nothing; drop cleanup that only undoes registrations.
- `api.hooks.off(type, handler)` becomes `const off = api.hooks.on(type, handler); off();`.
- `api.events.off/has/count`: keep your own unsubscribe from `api.events.on`.
- UI actions: the host dispatches them itself.
- Capabilities: no replacement; register Tools with `api.tools.register`.

## Packages

- `@rowan-agent/agent` 0.33.0
