# Rowan Agent 0.40.0 - host API extension code source

`ExtensionHost.extendApi` now receives the path of the code that asked for
host namespaces. An Extension id or Phase name alone cannot distinguish code
with the same name from different resource layers.

- **Extensions**: `source.path` is `LoadedExtension.path`.
- **File Phases**: `source.path` is the Phase's `PHASE.md` path.
- **Programmatic Extension Phases**: when a Phase has no file path, `source.path`
  is the path of the Extension that registered it.
- **One signature**: every `extendApi` implementation and forwarder receives
  `(extensionId, kind, source)`.

No data migrations are required. Hosts that do not need the path can ignore the
third argument.

## Packages

- `@rowan-agent/agent` 0.40.0
- `@rowan-agent/models` 0.13.0
