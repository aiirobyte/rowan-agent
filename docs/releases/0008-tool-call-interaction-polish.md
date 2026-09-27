# Rowan Agent 0.11.0 — tool-call interaction history polish and read-only tool error handling

This release polishes the tool-call interaction machinery introduced in 0.10.2 based on real-world usage in Mori's permission system, and ensures non-fatal errors from read-only core tools do not fail the Run.

Status: staged and package-built locally; npm publication requires explicit authorization for the external registry mutation.

## Fixes

1. **Tool-call interaction prompt omitted from message history**
   When a Run suspends for a tool-call interaction, the interaction prompt is no longer committed as an assistant message in the conversation history. Phase interactions preserve their existing behavior (assistant prompt message committed).

2. **Tool-call interaction answer omitted from message history**
   Resolving a tool-call interaction via `respondInteraction` records the answer in `run.interactionAnswers` for re-entry into the tool hook, without appending a `role: "user"` message to the conversation history. Phase interactions continue to append the user message as before.

3. **Read-only core tool errors return non-fatal failures**
   The core `read` tool now returns `{ ok: false, content: null, error: message }` on ordinary errors (such as `ENOENT: no such file or directory`) instead of throwing unhandled exceptions. This allows the model to observe the tool failure and recover, rather than marking the tool call `indeterminate` and failing the entire Run. Side-effecting tools preserve indeterminate semantics on unknown failures.

## Runtime contract & Types

- `PhaseInteraction` includes optional `origin?: PhaseInteractionOrigin` (`"tool_call" | "phase"`) and `toolCallId?: string` to preserve the origin across restarts and rehydration.
- `PhaseInteractionOrigin` is exported from `@rowan-agent/agent`.
- `InputRequiredCommit`, `RunSnapshot.request`, and `RunBoundary` treat `prompt` as optional (`prompt?: AssistantMessage`).

## Compatibility

Breaking for TypeScript hosts: `prompt` on `RunSnapshot.request`, `RunBoundary` and `InputRequiredCommit` is now optional, because a tool-call interaction commits no prompt message. A host that reads `request.prompt` or `boundary.prompt` must handle its absence (for example by falling back to the open interaction's `prompt`). Phase interactions and existing tool execution hooks behave unchanged at runtime.
