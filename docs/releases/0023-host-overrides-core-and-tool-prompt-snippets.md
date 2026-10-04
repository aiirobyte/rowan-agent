# Rowan Agent 0.16.1 — host-defined resources replace built-ins by name and Tool prompt snippets restored

This release enables host-defined resources to override Rowan built-ins by name and fixes a regression where Tool prompt snippets and guidelines did not reach the system prompt in the durable runtime.

## Host-defined resources replace built-ins by name

Previously, Rowan gave built-in core Tools (`read`, `edit`, `write`, `bash`) and core Phases (`default`, `stop`, `compact`) absolute precedence or rejected host resources with the same name with collision errors (`Configured Phase collides with Rowan built-in Phase`). Hosts that route file operations through document sessions or provide custom lifecycle entry points could not replace Rowan's built-in implementations.

Following [ADR-0013](../adr/0013-host-defined-resources-replace-built-ins-by-name.md), host-defined and Extension-registered resources now directly replace Rowan built-ins with the same name:

- **Precedence**: Host sources (more specific) > Extension sources (`rowan.extensions`) > Rowan built-in core (`rowan.core`).
- **Preserved built-in status**: Replaced Core Tools stay always-available across all Agent Definitions without requiring explicit selection in `definition.tools`, and replaced Core Phases retain their built-in execution roles (`default` entry, `stop`, `compact`).
- **Compact Phase tool selection**: The built-in `compact` Phase filters tools by name (`read` or `bash`) from the assembled context rather than depending on `tool.core`, ensuring host replacements are offered to and executed by the summarizer.
- **Reserved routing controls**: Routing controls remain protected and cannot be claimed by host sources (`route` for Tools, `continue` for Phases).
- **Scope collisions**: Non-core duplicate names across peer host sources within the same Resource View continue to collide as before.

## Tool prompt snippets and guidelines restored

Since v0.9.9 (commit `25c66a5`), `createRuntimeCoreTools` only copied `name`, `description`, and `parameters` into the runtime Tool contract, omitting `promptSnippet` and `promptGuidelines`. Consequently, no Tool's prompt snippets or prompt guidelines ever reached the model request's system prompt in the durable runtime, even though the legacy harness tools defined them and `buildSystemPrompt` still formatted them.

This release restores `promptSnippet` and `promptGuidelines` plumbing across the durable runtime:

- The runtime `Tool` contract in `runtime/contracts.ts` and Extension `ToolDefinition` in `extensions/types.ts` declare optional `promptSnippet` and `promptGuidelines`.
- `createRuntimeCoreTools`, `adaptExtensionTool`, and `projectTool` preserve and forward prompt snippets and guidelines into the provider-facing model context.
- The model request's system prompt now correctly includes prompt snippets in the `Available tools:` list and guidelines in the `Guidelines:` list for built-in Core Tools, host replacements, and Extension-registered tools.

## Packages

- `@rowan-agent/agent` 0.16.1
- Other package versions unchanged
