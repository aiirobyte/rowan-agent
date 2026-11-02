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
  thinkingLevel: "off",
  input: ["text"],
  headers: { "X-Model-Route": "default" },
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128_000,
  maxTokens: 4096,
});

const model = resolveModel("openai/gpt-4o");
for await (const event of stream(model!, request, ctx)) {
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

Built-in protocols are `openai-completions`, `openai-responses`,
`openai-codex-responses`, and `anthropic-messages`. Provider transport handles
headers, timeouts, aborts, structured errors, and retries consistently.

## Provider authentication

`ModelConfig` and `ProviderConfig` accept one optional, serializable `auth`
mode. Its absence keeps the existing static `apiKey` behavior:

```ts
// Absent: Authorization: Bearer <apiKey> (or x-api-key for Anthropic).
{ provider: "openai", apiKey: process.env.OPENAI_API_KEY! }

// Keyless local server: no Authorization or x-api-key header.
{ provider: "ollama", baseUrl: "http://127.0.0.1:11434/v1", auth: "none" }

// Subscription login. The provider id keys the stored credential.
{ provider: "xai", baseUrl: "https://cli-chat-proxy.grok.com/v1", auth: "xai" }
```

Named flows are `"xai"`, `"github-copilot"`, and `"openai-codex"`. They never
put tokens in configuration. The host supplies an owner-controlled credential
store to the stream:

```ts
const streamModel = createModelStream(config, {
  oauthCredentialStore: {
    async load(providerId) {
      // Return OAuthCredential | undefined.
    },
    async save(providerId, credential) {
      // Persist the rotated credential before returning.
    },
  },
});
```

Before each HTTP attempt, an OAuth stream loads the provider's credential,
refreshes it when it expires within 60 seconds, saves a rotated credential
before use, and single-flights refresh per provider id. A failed refresh fails
the request rather than reusing a stale token. A missing credential raises
`OAuthSignInRequiredError` with `code: "sign_in_required"`.

Start login with `startOAuthLogin(flow, options)`. Browser flows expose `url`;
device flows expose `userCode` and `verificationUri`. Save the resolved
credential under the same provider id used by the model configuration:

```ts
const session = await startOAuthLogin("xai");
console.log(session.url ?? `${session.verificationUri} (${session.userCode})`);
const credential = await session.credential;
await store.save("xai", credential);
// session.cancel() aborts an unfinished login and closes any listener.
```

`refreshOAuthCredential(flow, credential, options?)` is the same refresh path
used by request authentication.

## Protocol types

This package defines model requests and responses, content blocks, Tool calls,
and stream events. Agent identities, Runs, Durable Events, and Tool lifecycle
contracts belong to `@rowan-agent/agent`.

```ts
type StreamFn = (
  request: LlmRequest,
  ctx: ProviderCallContext,
) => AsyncIterable<LlmStreamEvent>;
```

### ProviderCallContext

Stream functions receive a `ProviderCallContext` with:
- `signal: AbortSignal` — the run-level cancellation signal.
- `run: { id, agentId, scope, cwd }` — active execution metadata.
- `internal?: boolean` — `true` when the call works on a copy of the conversation (an internal model loop). Its messages are not written to history, so a provider that keeps conversation state between calls must not advance it. Absent means a normal conversation call.
- `interact(request): Promise<JsonValue>` — request live interaction from the user.
- `tools.list(): readonly LlmToolDefinition[]` — registered tool definitions with metadata.
- `tools.call(name, args, options?): Promise<ToolResult>` — invoke a registered tool.
  - `options.signal?: AbortSignal` — aborts that single tool call without cancelling the Run.
  - `options.onUpdate?(toolCall: ToolCall, progress?: ToolProgress): void` — receives the merged ToolCall every time it changes during execution (start, each progress-driven `present` update, final). The raw `progress` object is passed when the update was triggered by a progress report.
- `tools.report(update: ToolCall | ToolCallUpdate): void` — report external tool execution.

### ToolProgress

Progress reports use the standard MCP `notifications/progress` shape:
```ts
type ToolProgress = {
  progress: number;
  total?: number;
  message?: string;
  _meta?: JsonObject;
};
```
- Shape is validated (finite numbers); invalid reports are dropped with a warning without failing the tool call.
- Tool-private progress data goes under `_meta` keys.
- Continuous output must be reported cumulatively (e.g. a tail), because transient updates coalesce per `toolCallId`.

## Source structure

```
src/
├── protocol.ts       # Model/LLM request and response types
├── auth.ts           # Auth modes, credentials, and the credential-store seam
├── models.ts         # Model registry
├── registry.ts       # Protocol dispatch
├── sse.ts            # SSE parser
├── oauth/            # Login, refresh, polling, and provider request auth
└── providers/        # Built-in HTTP providers and shared transport
```
