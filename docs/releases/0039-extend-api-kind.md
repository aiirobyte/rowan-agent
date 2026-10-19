# Rowan Agent 0.35.0 — `extendApi` receives the caller's kind

A host's `extendApi(id)` was called with the same kind of id for an Extension and for an Extension Phase, so a host could not tell an Extension `acp` from a Phase `acp` and could not give each its own resources (such as a runtime data directory). `extendApi(id, kind)` now receives `kind`: `"extension"` when an Extension loads and `"phase"` when an Extension Phase activates.

- `HostApiKind` (`"extension" | "phase"`) is exported from `@rowan-agent/agent/runtime`.
- A host that ignores the second argument keeps working.

## Packages

- `@rowan-agent/agent` 0.35.0
