# Rowan Agent 0.34.0 — `runtime.onProvidersChanged`

The model registry had no change signal, so a host that lists registered Providers could not tell when an Extension registered, replaced or unregistered one. `runtime.onProvidersChanged(listener)` calls `listener` after each applied change and returns an unsubscribe function.

- Registrations made before the runtime is bound notify once, when they are applied, not once per Provider.
- Providers an Extension registered are removed when it is disposed; that notifies too.
- A listener that throws is logged and does not affect registration or other listeners.

## Packages

- `@rowan-agent/agent` 0.34.0
