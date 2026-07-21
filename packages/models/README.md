# @rowan-agent/models

Model registry, streaming provider implementations, cost calculation, and protocol types. Supports OpenAI Chat Completions, OpenAI Responses, and Anthropic Messages APIs with streaming, retry, tool calling, and thinking/reasoning.

## Installation

```bash
bun add @rowan-agent/models
```

## Quick Start

```ts
import { resolveModel, calculateCost, stream } from "@rowan-agent/models";

const model = resolveModel("anthropic/claude-sonnet-4-20250514");

for await (const event of stream(model, request, { signal })) {
  if (event.type === "text_delta") process.stdout.write(event.delta);
}

const cost = calculateCost(model, usage);
console.log(cost.total); // USD
```

## Model Registry

An in-memory registry of model definitions. Models are auto-registered on import from `models.generated.ts`. Use `resolveModel` for quick lookup by `"provider/model"` string, or `registerModel` to add custom models.

```ts
import { registerModel, getModel, resolveModel, getProviders, getModels, getAllModels } from "@rowan-agent/models";

registerModel({
  id: "gpt-4.1-mini", name: "gpt-4.1-mini",
  api: "openai-completions", provider: "openai",
  baseUrl: "https://api.openai.com/v1",
  reasoning: false, input: ["text", "image"],
  cost: { input: 0.40, output: 1.60, cacheRead: 0.10, cacheWrite: 0.40 },
  contextWindow: 1047576, maxTokens: 32768,
});

const model = resolveModel("openai/gpt-4.1-mini");
const providers = getProviders();           // ["openai", "anthropic", ...]
const all = getAllModels();                  // Model[]
```

### Pre-registered Models

| Provider | Models |
|----------|--------|
| `anthropic` | claude-sonnet-4-20250514, claude-opus-4-20250514, claude-haiku-4-20250514 |
| `openai` | gpt-4o, and others |

## Cost Calculation

Computes per-token costs from usage data, broken down by input, output, cache read, and cache write.

```ts
import { calculateCost, resolveModel } from "@rowan-agent/models";

const model = resolveModel("anthropic/claude-sonnet-4-20250514")!;
const cost = calculateCost(model, {
  inputTokens: 1000, outputTokens: 500,
  cacheReadTokens: 2000, cacheWriteTokens: 100,
});
// cost = { input, output, cacheRead, cacheWrite, total }
```

## Providers

Three built-in API providers share the same HTTP error normalization, timeout, abort, and
exponential-backoff retry behavior. `maxRetries` is the number of attempts after the initial
request. `timeoutMs` is the maximum idle gap while waiting for response headers or body bytes.
Custom model `headers` are merged after protocol defaults, so they can add or override headers
without introducing another provider implementation.

Failures use `ProviderError` with stable `code`, `status`, `retryable`, and `details` fields.
Non-JSON error pages never become the user-facing message; a bounded copy is retained as
`details.responseBody` for diagnostics.

### Provider Registry

The model stream routes requests to the right provider based on the model's `protocol` field.

```ts
import { stream, streamByRef, createModelStream, registerApiProvider } from "@rowan-agent/models";

for await (const event of stream(model, request, { signal })) { ... }
for await (const event of streamByRef("openai/gpt-4.1-mini", request)) { ... }

const streamFn = createModelStream();         // registry-backed StreamFn
const boundStream = createModelStream(model); // StreamFn bound to one Model
registerApiProvider({ protocol: "my-api", stream: myApiStreamFn });  // custom provider
```

Extensions implementing a custom protocol can import `executeProviderRequest` or
`streamProviderRequest` from `@rowan-agent/models/providers`. These public transport operations
apply the same headers, timeout, abort, structured error, and retry behavior as built-in providers;
the extension only supplies its request and response decoder.

The transport contract is intentionally small:

- `request()` runs once per attempt; rebuild any one-shot request body there.
- `config.headers` override headers returned by `request()`.
- A `ProviderResponse` body can be consumed once through `json()`, `text()`, or `sse()`.
- `timeoutMs` applies only while awaiting headers or the next body chunk, not while downstream code
  processes an event.
- A stream may retry only before text, thinking, or tool-call output is emitted. After partial output,
  its failure is marked non-retryable to prevent a duplicate Agent Run.
- Terminal stream failures are emitted as one `error` followed by `done({ stopReason: "error" })`.

### OpenAI Chat Completions

Endpoint: `{baseUrl}/chat/completions`. Auth: `Authorization: Bearer`.

```ts
import { resolveOpenAICompletionsConfig, createOpenAICompletionsStream, callOpenAICompletions } from "@rowan-agent/models/providers";

const config = resolveOpenAICompletionsConfig();           // from env vars
const streamFn = createOpenAICompletionsStream(config);    // StreamFn
const response = await callOpenAICompletions(config, req); // non-streaming
```

Supports: text, image (base64), tool calling, streaming (SSE with non-streaming fallback), JSON response format.

### OpenAI Responses

Endpoint: `{baseUrl}/responses`. Auth: `Authorization: Bearer`.

```ts
import { resolveOpenAIResponsesConfig, createOpenAIResponsesStream } from "@rowan-agent/models/providers";

const config = resolveOpenAIResponsesConfig({ reasoningEffort: "high" });
const streamFn = createOpenAIResponsesStream(config);
```

Supports: text, tool calling, streaming (always), thinking/reasoning via `reasoningEffort`.

### Anthropic Messages

Endpoint: `{baseUrl}/v1/messages`. Auth: `x-api-key` + `anthropic-version: 2023-06-01`.

```ts
import { resolveAnthropicConfig, createAnthropicStream } from "@rowan-agent/models/providers";

const config = resolveAnthropicConfig({ thinking: { budgetTokens: 10000 } });
const streamFn = createAnthropicStream(config);
```

Supports: text, image (base64), tool calling, streaming (always), thinking/reasoning via `thinking.budgetTokens`.

## SSE Streaming

Low-level SSE parser for `ReadableStream` bodies.

```ts
import { iterateSseMessages } from "@rowan-agent/models";

for await (const sse of iterateSseMessages(response.body!, signal)) {
  if (sse.data === "[DONE]") break;
  const chunk = JSON.parse(sse.data);
}
```

## Protocol Types

Shared types for LLM requests, responses, stream events, and agent-level constructs.

```ts
type LlmRequest = { model: ModelRef; system?: string; messages: LlmMessage[]; tools?: LlmToolDefinition[]; toolChoice?: LlmToolChoice; maxTokens?: number; temperature?: number };
type LlmResponse = { content: string; thinking?: string; toolCalls?: LlmToolCall[]; stopReason?: LlmStopReason; usage?: LlmTokenUsage };
type LlmStreamEvent = { type: "start" } | { type: "text_delta"; delta: string } | { type: "thinking_delta"; delta: string } | { type: "tool_call_start"; ... } | { type: "done"; stopReason: LlmStopReason } | ...;
type StreamFn = (request: LlmRequest, options: LlmStreamOptions) => AsyncIterable<LlmStreamEvent>;
type ModelRef = { provider: string; name: string };
type Model = { id: string; name: string; api: Api; provider: Provider; baseUrl: string; reasoning: boolean; input: ("text" | "image")[]; cost: ModelCost; contextWindow: number; maxTokens: number };
type KnownApi = "openai-completions" | "openai-responses" | "anthropic-messages";
type KnownProvider = "openai" | "anthropic" | "deepseek" | "openrouter" | "groq" | "together" | "fireworks" | "xai" | "cerebras";
```

Agent-level types shared with the agent package:

```ts
type AgentMessage = { id: string; role: "system" | "user" | "assistant" | "tool"; content: string | LlmContentPart[]; createdAt: string };
type AgentEvent = { type: "agent_start" | "agent_end" | "turn_start" | ... ; ts: string; ... };
type ToolCall = { id: string; name: string; args: unknown };
type ToolResult = { toolCallId: string; toolName: string; ok: boolean; content: unknown; error?: string };
type Outcome = { id: string; message: string; payload?: unknown; toolResults?: Array<...> };
```

## Source Structure

```
src/
├── protocol.ts           # All protocol types
├── models.ts             # Model registry
├── models.generated.ts   # Pre-registered model catalog
├── registry.ts           # API provider dispatch (stream, streamByRef)
├── sse.ts                # SSE parser
└── providers/
    ├── openai-completions.ts
    ├── openai-responses.ts
    ├── anthropic.ts
    ├── http.ts           # HTTP lifecycle, structured errors, timeout, abort, retry
    └── shared.ts         # ProviderError, shared config and usage helpers
```

## Version

Current version: **0.6.0**
