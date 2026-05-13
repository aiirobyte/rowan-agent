# @rowan-agent/adapters

## Main Features

`@rowan-agent/adapters` connects external model services to the Rowan runtime protocol. The current primary implementation is an OpenAI-compatible Chat Completions adapter that resolves configuration, builds requests, handles retries and timeouts, and normalizes JSON model output into typed Rowan phase output events such as routing decisions, tasks, tool calls, and verification results.

The package also provides JSON extraction helpers. They can parse complete JSON, `json` fenced code blocks, or balanced JSON fragments embedded in text. When model output does not match the expected contract, the adapter raises `OpenAICompatibleError` or `JsonExtractionError` with useful error codes for logging and recovery.

## Architecture

`src/index.ts` exports the package surface.

`src/openai-compatible.ts` is the main adapter layer and has three core responsibilities:

- `resolveOpenAICompatibleConfig` resolves `baseUrl`, `apiKey`, `model`, timeout, retry, and tool settings from input options and environment variables.
- `callOpenAICompatibleChatCompletion` wraps HTTP requests, response parsing, error normalization, exponential backoff retries, and abort/timeout handling.
- `createOpenAICompatibleStream` implements Rowan's `StreamFn`, uses `@rowan-agent/context` to build phase prompts, and converts model output into typed `phase_output` events from `@rowan-agent/protocol`.

`src/json-extract.ts` only handles JSON extraction and parse errors from model text. It is independent from model providers and runtime phases.

## Usage Flow

1. Prepare OpenAI-compatible environment variables: `ROWAN_OPENAI_BASE_URL` is optional, while `ROWAN_OPENAI_API_KEY` and `ROWAN_MODEL` are required.
2. Call `resolveOpenAICompatibleConfig` and pass the runtime tools through `tools`.
3. Call `createOpenAICompatibleStream` to create a `StreamFn` that the Rowan runtime can consume.
4. Pass the `stream` to `Agent` from `@rowan-agent/agent`.

```ts
import {
  createOpenAICompatibleStream,
  resolveOpenAICompatibleConfig,
} from "@rowan-agent/adapters";

const config = resolveOpenAICompatibleConfig({ tools });
const stream = createOpenAICompatibleStream(config);
```
