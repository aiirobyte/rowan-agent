# @rowan-agent/models

Model descriptors, protocol Provider dispatch, SSE streaming, and cost
calculation. The Agent Runtime uses this package through `ModelConfig` or
`ModelRef + StreamFn`; it does not depend on Agent lifecycle state.

## Model registry

```ts
import { registerModel, resolveModel, stream } from "@rowan-agent/models";

registerModel({
  id: "gpt-4o",
  provider: "openai",
  protocol: "openai-responses",
  baseUrl: "https://api.openai.com/v1",
  apiKey: process.env.OPENAI_API_KEY!,
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128_000,
  maxTokens: 4096,
});

const model = resolveModel("openai/gpt-4o");
for await (const event of stream(model!, request, { signal })) {
  // consume LlmStreamEvent
}
```

`resolveModel()` parses `provider/model`; `registerModel()` registers custom
models. `streamByRef()` handles registered models, while `createModelStream()`
returns a Runtime-compatible `StreamFn`. Both dispatch only through the model's
`protocol` and do not retain the old Provider factory.

## Provider registry

```ts
import { registerApiProvider } from "@rowan-agent/models";

registerApiProvider({ protocol: "my-api", stream: myStream });
```

Built-in protocols are `openai-completions`, `openai-responses`, and
`anthropic-messages`. Provider transport handles headers, timeouts, aborts,
structured errors, and retries consistently.

## Protocol types

This package defines model requests and responses, content blocks, Tool calls,
and stream events. Agent identities, Runs, Durable Events, and Tool lifecycle
contracts belong to `@rowan-agent/agent`.

```ts
type StreamFn = (
  request: LlmRequest,
  options: LlmStreamOptions,
) => AsyncIterable<LlmStreamEvent>;
```

## Source structure

```
src/
├── protocol.ts       # Model/LLM request and response types
├── models.ts         # Model registry
├── registry.ts       # Protocol dispatch
├── sse.ts            # SSE parser
└── providers/        # Built-in HTTP providers and shared transport
```
