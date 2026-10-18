# Rowan Agent 0.31.0 and Models 0.12.0 — One Shared Vocabulary

Every shared concept across Rowan Agent and Models now has exactly one TypeScript definition and one canonical name.

Wire and storage formats are unchanged: serialized JSON, field names, and the durable store schema stay 100% byte-compatible. Only TypeScript names and definitions moved to their canonical locations.

## Naming Rules

- `*Block` = one content item. Plain name = shared or durable (what `api.agents.history` returns). `Llm` prefix = provider wire format only (`LlmRequest`, `LlmResponse`, `LlmStreamEvent`, wire messages).
- `*Record` = a durable record with identifiers. Composed (`X & { ... }`, `Omit`, `Mutable<...>`) instead of repeating fields.
- A concept lives in the lowest package that needs it (`models` for JSON, scope, content, interaction request, tool results; `agent` for runs, messages, tools, hooks). The higher package imports it.

## Elimination of Legacy Loop Types

The legacy duplicate types in `src/types.ts` and `src/protocol/tool.ts` (`Tool<TArgs>`, `ToolCall { id, name, args }`, `ToolResult`, `Outcome`, `BeforeToolCall`, `AfterToolCall`, `ToolContext`) are completely removed. The execution loop (`src/loop/*`, `runtime/execution.ts`, `runtime/model-context.ts`, `harness/*`) directly uses durable types, eliminating adapters between shapes.

## Vocabulary Migration Table

| Concept | Today | Final | Where |
|---|---|---|---|
| JSON | `JsonPrimitive`/`JsonValue`/`JsonObject` in models **and** `runtime-events.ts` | one set | models |
| Metadata | `Metadata = JsonObject` | delete, use `JsonObject` | — |
| Scope | `ScopeRef` | unchanged | models |
| Interaction request | `RunInteractionKind`, `RunInteractionRequest` in models **and** `harness/phases/interactions.ts` | one set; `RunInteraction` and `InteractionRecord` compose from it (`InteractionRecord.kind` is `RunInteractionKind`) | models |
| Text / image / thinking | `LlmTextContent`, `LlmImageContent`, `LlmThinkingContent`; `TextBlock`, `ImageBlock`, `ThinkingBlock`; `TextContent`, `ImageContent`, `ThinkingContent` | `TextBlock`, `ImageBlock`, `ThinkingBlock` (readonly; internal accumulators use a local mutable type) | models |
| ACP content | `ContentBlock` includes `ThinkingBlock` and `ToolCallBlock` | `ContentBlock = TextBlock \| ImageBlock \| AudioBlock \| ResourceLinkBlock \| ResourceBlock` (what tools return and ACP shows) | models |
| Streaming partial | `AssistantMessagePartial.contentBlocks: ContentBlock[]` | `StreamBlock = TextBlock \| ThinkingBlock \| ToolCallBlock` (add `ImageBlock` only if a provider streams images); `contentBlocks: StreamBlock[]`; durable `contentBlocks` fields take `StreamBlock` | models |
| Wire tool use | `LlmToolUseContent` | `LlmToolUseBlock` | models |
| Wire tool result | `LlmToolResultContent` | `LlmToolResultBlock` | models |
| Wire content | `LlmContentPart` | `LlmContentBlock = TextBlock \| ImageBlock \| ThinkingBlock \| LlmToolUseBlock \| LlmToolResultBlock` | models |
| Wire message | `LlmMessage` | unchanged (content `string \| LlmContentBlock[]`) | models |
| Wire tool definition | `LlmToolDefinition`, `ToolDefinitionSummary` (models), `ProviderToolDefinition` (contracts) | `LlmToolDefinition` with `parameters: JsonObject` and optional `_meta`; the other two deleted (`ProviderCallContext.tools.list()` returns it) | models |
| Tool result | `ToolExecutionResult` (agent), `ToolCallOutcome` (models), legacy `ToolResult` | `ToolResult` (today's `ToolExecutionResult` union; `ProviderCallContext.tools.call` returns it) | models |
| Tool result with ids | `DurableToolResult`, legacy `Outcome.toolResults` item | `ToolResultRecord = { toolCallId, toolName } & ToolResult` | agent |
| Durable tool use | `ToolUseContent` | `ToolUseBlock` | agent |
| Durable tool result | `ToolResultContent` | `ToolResultBlock` | agent |
| Durable messages | `Message`, `UserMessage`, `AssistantMessage`, `ToolMessage`, `InteractionRecord`, `MessageBase`, `UserContent`, `AssistantContent`, `ToolMessageContent`, `MessageContent` | unchanged names; contents use the blocks above | agent |
| Tool | durable `Tool` (contracts), extension `ToolDefinition`, legacy `Tool<TArgs>` | one `Tool` (contracts' shape + `executionMode`); `api.tools.register(tool: Tool)`; `parameters` accepts a TypeBox schema or a plain JSON Schema object; `RegisteredTool.definition: Tool` | agent |
| Tool call (ACP display) | models `ToolCall`, legacy `ToolCall {id,name,args}` | models `ToolCall` only; `ToolCallSnapshot = ToolCall & {…}`; `StoredToolCall = Mutable<ToolCallSnapshot>` if the fields coincide | models / agent |
| Tool call state | `ToolCallState = ToolCallStatus` | delete, use `ToolCallStatus` | models |
| Model's tool call | `LlmToolCall`, `ToolCallBlock` | unchanged (wire / stream) | models |
| Tool hooks | `BeforeToolCall`, `AfterToolCall` in contracts **and** `types.ts` | contracts only | agent |
| Outcome | `Outcome` in `runtime-events.ts` **and** `protocol/agent.ts` | `runtime-events.ts` only (the loop's `display` flag moves where the loop needs it) | agent |
| Loop message | `AgentMessage` (`protocol/agent.ts`) | internal, not exported, defined as a composition of `LlmMessage` | agent |
| Loop tool context | `ToolContext` | delete, the loop uses `ToolInvocationContext` | agent |
| Resource kind | `ResourceKind` in `resource-validation.ts` **and** `resource-registry.ts` | registry's only; validation narrows with `Extract` | agent |
| Contribution aliases | `ToolContribution = Tool`, `PhaseContribution = Phase` | delete | agent |

## Public Interfaces

Each export name is defined in and exported from exactly one entry point:
- `@rowan-agent/models`: 20 values, 56 types (contract and protocol primitives).
- `@rowan-agent/agent`: 3 values, 115 types (authoring surface for Extensions and Phases).
- `@rowan-agent/agent/runtime`: 32 values, 52 types (host-embedding surface).

Zero overlapping exports across entry points.

## Packages

- `@rowan-agent/agent` 0.31.0
- `@rowan-agent/models` 0.12.0
