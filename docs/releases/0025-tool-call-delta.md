# Rowan Agent 0.17.0 — transient tool call deltas and provider tool call identity

This release adds transient `tool_call_delta` runtime events so hosts can observe tool call arguments live while the model is generating them, introduces a best-effort partial JSON parser, and exposes `providerToolCallId` on tool execution contexts.

## Transient tool call streaming deltas

Previously, model providers emitted `tool_call_delta` stream events and the agent stream collector accumulated them internally, but no corresponding event reached the runtime event stream.

This release introduces the `tool_call_delta` transient runtime event, plumbed end-to-end matching `thinking_delta`:

- **Event shape**: `ToolCallDelta = { kind: "tool_call_delta"; durability: "transient"; runId; executionId; messageId; providerToolCallId: string; toolName: string; arguments: string; args: JsonValue | undefined }`.
- **Accumulated raw arguments**: `arguments` contains the entire raw JSON text accumulated so far for the tool call, rather than an incremental fragment.
- **Best-effort parsed args**: `args` provides a best-effort parse of the incomplete JSON so far, allowing host consumers (such as document editors streaming document edits or file writes live) to read values like `args.edits[0].newText` as they grow.
- **Execution and abort guards**: Transient publishing observes the same runtime closed, aborted, and active execution guards as `thinking_delta`.

## Best-effort partial JSON parsing

A new internal helper `parsePartialJson` safely parses incomplete JSON prefixes without external dependencies:

- **Open string completion**: Incomplete strings are closed while preserving all text received so far; dangling trailing backslashes and partial `\uXXXX` unicode sequences are stripped.
- **Container completion**: Open objects and arrays are properly closed.
- **Dropping incomplete tokens**: Trailing incomplete keys, trailing colons, and literals/numbers cut mid-way (such as `tru`, `fal`, `-`, `12.`) are dropped cleanly rather than failing the parse.
- Returns `undefined` when no usable JSON structure can be parsed.

## Provider tool call identity on ToolCallContext

To allow hosts to correlate executed tool calls with the streaming deltas observed earlier:

- `providerToolCallId: string` is added to `ToolCallContext` (and `ToolInvocationContext`).
- Both batch and sequential tool execution paths in `durable-runtime` pass `providerToolCallId` to `durableTool.execute(args, context, signal)`.

## Packages

- `@rowan-agent/agent` 0.17.0
- Other package versions unchanged
