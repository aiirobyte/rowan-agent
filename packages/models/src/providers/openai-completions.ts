import type {
  Model,
  LlmMessage,
  LlmRequest,
  LlmStreamEvent,
  LlmTokenUsage,
  LlmStreamOptions,
  LlmToolCall,
  LlmToolDefinition,
  StreamFn,
  ApiStreamFn,
  AssistantMessagePartial,
  LlmContentPart,
} from "../protocol";
import { iterateSseMessages } from "../sse";
import {
  ProviderError,
  type ProviderFetch,
  type BaseProviderConfig,
  normalizeBaseUrl,
  nonEmpty,
  requireValue,
  defaultEnv,
  createRequestSignal,
  readErrorBody,
  isRetryableStatus,
  normalizeRequestError,
  normalizeUsage,
  summarizeRequestUsage,
  normalizeRetryNumber,
  shouldRetry,
  waitForRetry,
  DEFAULT_MAX_RETRIES,
  DEFAULT_RETRY_DELAY_MS,
  asTrimmedString,
  isRecord,
  truncateString,
} from "./shared";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export type OpenAICompletionsConfig = BaseProviderConfig & {
  responseFormat?: boolean;
};

export type ResolveOpenAICompletionsConfigInput = {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  fetch?: ProviderFetch;
  responseFormat?: boolean;
  env?: Record<string, string | undefined>;
};

export function resolveOpenAICompletionsConfig(
  input: ResolveOpenAICompletionsConfigInput = {},
): OpenAICompletionsConfig {
  const env = input.env ?? defaultEnv();
  const baseUrl =
    nonEmpty(input.baseUrl) ?? nonEmpty(env.ROWAN_OPENAI_BASE_URL) ?? "https://api.openai.com/v1";
  const apiKey = nonEmpty(input.apiKey) ?? nonEmpty(env.ROWAN_OPENAI_API_KEY);
  const model = nonEmpty(input.model) ?? nonEmpty(env.ROWAN_MODEL);

  return {
    baseUrl: normalizeBaseUrl(baseUrl),
    apiKey: requireValue("API key", apiKey, "set ROWAN_OPENAI_API_KEY or pass --api-key"),
    model: requireValue("model", model, "set ROWAN_MODEL or pass --model"),
    ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
    ...(input.maxTokens !== undefined ? { maxTokens: input.maxTokens } : {}),
    ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
    ...(input.maxRetries !== undefined ? { maxRetries: input.maxRetries } : {}),
    ...(input.retryDelayMs !== undefined ? { retryDelayMs: input.retryDelayMs } : {}),
    ...(input.fetch ? { fetch: input.fetch } : {}),
    ...(input.responseFormat !== undefined ? { responseFormat: input.responseFormat } : {}),
  };
}

// ---------------------------------------------------------------------------
// HTTP error
// ---------------------------------------------------------------------------

function providerErrorFromBody(body: unknown): Record<string, unknown> | undefined {
  if (typeof body === "string") {
    const message = asTrimmedString(body);
    return message ? { message: truncateString(message) } : undefined;
  }
  if (!isRecord(body)) return undefined;

  const error = body.error;
  if (typeof error === "string") {
    const message = asTrimmedString(error);
    return message ? { message } : undefined;
  }

  const source = isRecord(error) ? error : body;
  const message = asTrimmedString(source.message);
  const code = asTrimmedString(source.code);
  const type = asTrimmedString(source.type);
  if (!message && !code && !type) return undefined;

  return { ...(message ? { message } : {}), ...(code ? { code } : {}), ...(type ? { type } : {}) };
}

function normalizeHttpError(
  response: Response,
  body: unknown,
  context: { endpoint: string; model: string },
): ProviderError {
  const providerError = providerErrorFromBody(body);
  const providerMessage = asTrimmedString(providerError?.message);
  const statusSummary = response.statusText
    ? `${response.status} ${response.statusText}`
    : String(response.status);
  const message = providerMessage
    ? `Request failed (${statusSummary}): ${providerMessage}`
    : `Request failed with status ${statusSummary}.`;

  return new ProviderError({
    code: "http_error",
    message,
    status: response.status,
    retryable: isRetryableStatus(response.status),
    details: {
      endpoint: context.endpoint,
      model: context.model,
      status: response.status,
      ...(providerError ? { providerError } : {}),
    },
  });
}

// ---------------------------------------------------------------------------
// Message / tool conversion
// ---------------------------------------------------------------------------

type OpenAIChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> }
  | { role: "assistant"; content: string | null; tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> }
  | { role: "tool"; content: string; tool_call_id: string };

function convertMessages(messages: LlmMessage[]): OpenAIChatMessage[] {
  const result: OpenAIChatMessage[] = [];
  for (const msg of messages) {
    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        result.push({ role: "user", content: msg.content });
      } else {
        const parts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [];
        for (const part of msg.content) {
          if (part.type === "text") {
            parts.push({ type: "text", text: part.text });
          } else if (part.type === "image") {
            parts.push({ type: "image_url", image_url: { url: `data:${part.mimeType};base64,${part.data}` } });
          }
        }
        result.push({ role: "user", content: parts });
      }
    } else if (msg.role === "assistant") {
      if (typeof msg.content === "string") {
        result.push({ role: "assistant", content: msg.content });
      } else {
        // Check for tool_use blocks
        const toolUseBlocks = msg.content.filter((p) => p.type === "tool_use");
        const textBlocks = msg.content.filter((p): p is { type: "text"; text: string } => p.type === "text");
        const text = textBlocks.map((p) => p.text).join("") || null;

        if (toolUseBlocks.length > 0) {
          const toolCalls = toolUseBlocks.map((p) => ({
            id: p.id,
            type: "function" as const,
            function: {
              name: p.name,
              arguments: typeof p.input === "string" ? p.input : JSON.stringify(p.input),
            },
          }));
          result.push({ role: "assistant", content: text, tool_calls: toolCalls });
        } else {
          result.push({ role: "assistant", content: text });
        }
      }
    } else if (msg.role === "tool") {
      // OpenAI expects tool results as {role: "tool", content, tool_call_id}
      if (typeof msg.content === "string") {
        result.push({ role: "tool", content: msg.content, tool_call_id: "" });
      } else {
        // Extract tool_result content blocks
        for (const part of msg.content) {
          if (part.type === "tool_result") {
            result.push({ role: "tool", content: part.content, tool_call_id: part.toolUseId });
          }
        }
      }
    }
  }
  return result;
}

function convertTools(tools: LlmToolDefinition[]): Array<{
  type: "function";
  function: { name: string; description: string; parameters: unknown };
}> {
  return tools.map((tool) => ({
    type: "function" as const,
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));
}

// ---------------------------------------------------------------------------
// Body construction
// ---------------------------------------------------------------------------

function buildRequestBody(
  config: OpenAICompletionsConfig,
  request: LlmRequest,
  stream: boolean,
): Record<string, unknown> {
  const messages = convertMessages(request.messages);
  if (request.system) {
    messages.unshift({ role: "system", content: request.system });
  }

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    stream,
  };

  if (stream) {
    body.stream_options = { include_usage: true };
  }

  if (request.temperature !== undefined || config.temperature !== undefined) {
    body.temperature = request.temperature ?? config.temperature ?? 0;
  }

  if (request.maxTokens ?? config.maxTokens) {
    body.max_tokens = request.maxTokens ?? config.maxTokens;
  }

  if (request.tools && request.tools.length > 0) {
    body.tools = convertTools(request.tools);
  }

  if (config.responseFormat) {
    body.response_format = { type: "json_object" };
  }

  return body;
}

// ---------------------------------------------------------------------------
// Stop reason mapping
// ---------------------------------------------------------------------------

function mapFinishReason(reason: string | null | undefined): "end_turn" | "max_tokens" | "tool_use" | "error" | "unknown" {
  switch (reason) {
    case null:
    case undefined:
      return "end_turn";
    case "stop": return "end_turn";
    case "length": return "max_tokens";
    case "tool_calls": return "tool_use";
    case "content_filter": return "error";
    default: return "unknown";
  }
}

// ---------------------------------------------------------------------------
// SSE chunk type
// ---------------------------------------------------------------------------

type ChatCompletionChunk = {
  id?: string;
  choices?: Array<{
    index?: number;
    delta?: {
      role?: string;
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: "function";
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; input_tokens?: number; output_tokens?: number };
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        type?: "function";
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; input_tokens?: number; output_tokens?: number };
};

// ---------------------------------------------------------------------------
// Streaming
// ---------------------------------------------------------------------------

async function* streamChatCompletions(
  config: OpenAICompletionsConfig,
  request: LlmRequest,
  options: LlmStreamOptions = {},
): AsyncGenerator<LlmStreamEvent> {
  const maxRetries = normalizeRetryNumber(config.maxRetries, DEFAULT_MAX_RETRIES);
  const retryDelayMs = normalizeRetryNumber(config.retryDelayMs, DEFAULT_RETRY_DELAY_MS);
  const body = buildRequestBody(config, request, true);
  const fetchImpl = config.fetch ?? fetch;
  const endpoint = `${normalizeBaseUrl(config.baseUrl)}/chat/completions`;
  const requestUsage = summarizeRequestUsage(request);
  let attempts = 0;

  while (true) {
    attempts += 1;
    const { signal, cleanup } = createRequestSignal({ signal: options.signal, timeoutMs: config.timeoutMs });

    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        throw normalizeHttpError(response, await readErrorBody(response), { endpoint, model: config.model });
      }
      if (!response.body) {
        throw new ProviderError({ code: "no_body", message: "Response body is null.", retryable: true });
      }

      yield { type: "model_requested", model: request.model, usage: { ...requestUsage } };

      // Non-streaming response
      if (!response.headers.get("content-type")?.includes("text/event-stream")) {
        const data = await response.json() as ChatCompletionResponse;
        const choice = data.choices?.[0];
        const message = choice?.message;
        const content = message?.content ?? "";
        const partial: AssistantMessagePartial = {
          role: "assistant",
          contentBlocks: [],
        };

        yield { type: "start", partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };

        if (content) {
          partial.contentBlocks.push({ type: "text", text: content });
          yield { type: "text_delta", text: content, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
        }

        const toolCallResults: LlmToolCall[] = [];
        for (const [index, tc] of (message?.tool_calls ?? []).entries()) {
          const id = tc.id ?? `call_${index}`;
          const name = tc.function?.name ?? "";
          const args = tc.function?.arguments ?? "";
          partial.contentBlocks.push({ type: "tool_call", id, name, args });
          yield { type: "tool_call_start", id, name, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
          yield { type: "tool_call_end", id, name, arguments: args, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
          let parsedArgs: unknown = args;
          try { parsedArgs = JSON.parse(args); } catch {}
          toolCallResults.push({ id, name, arguments: parsedArgs });
        }

        const usage = normalizeUsage(data.usage);
        yield {
          type: "done",
          response: {
            content,
            stopReason: mapFinishReason(choice?.finish_reason),
            ...(toolCallResults.length > 0 ? { toolCalls: toolCallResults } : {}),
            ...(usage ? { usage } : {}),
          },
        };
        return;
      }

      let content = "";
      let finishReason: string | null = null;
      let usage: LlmTokenUsage | undefined;
      const toolCalls = new Map<number, { id: string; name: string; arguments: string }>();

      const partial: AssistantMessagePartial = {
        role: "assistant",
        contentBlocks: [],
      };

      function rebuildPartial(): void {
        partial.contentBlocks = [];
        if (content) {
          partial.contentBlocks.push({ type: "text", text: content });
        }
        for (const tc of toolCalls.values()) {
          partial.contentBlocks.push({
            type: "tool_call",
            id: tc.id,
            name: tc.name,
            args: tc.arguments,
          });
        }
      }

      yield { type: "start", partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };

      for await (const sse of iterateSseMessages(response.body, signal)) {
        if (sse.data === "[DONE]") break;

        let chunk: ChatCompletionChunk;
        try { chunk = JSON.parse(sse.data) as ChatCompletionChunk; } catch { continue; }

        if (chunk.usage) usage = normalizeUsage(chunk.usage);

        const choice = chunk.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta;

        if (delta) {
          if (delta.content) {
            content += delta.content;
            rebuildPartial();
            yield { type: "text_delta", text: delta.content, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
          }
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const existing = toolCalls.get(tc.index);
              if (!existing) {
                const newTc = { id: tc.id ?? "", name: tc.function?.name ?? "", arguments: tc.function?.arguments ?? "" };
                toolCalls.set(tc.index, newTc);
                if (tc.id || tc.function?.name) {
                  rebuildPartial();
                  yield { type: "tool_call_start", id: newTc.id, name: newTc.name, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
                }
                if (tc.function?.arguments) {
                  yield { type: "tool_call_delta", id: newTc.id, arguments: tc.function.arguments, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
                }
              } else {
                if (tc.id) existing.id = tc.id;
                if (tc.function?.name) existing.name = tc.function.name;
                if (tc.function?.arguments) {
                  existing.arguments += tc.function.arguments;
                  rebuildPartial();
                  yield { type: "tool_call_delta", id: existing.id, arguments: tc.function.arguments, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
                }
              }
            }
          }
        }
        if (choice.finish_reason) finishReason = choice.finish_reason;
      }

      for (const tc of toolCalls.values()) {
        rebuildPartial();
        yield { type: "tool_call_end", id: tc.id, name: tc.name, arguments: tc.arguments, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
      }

      const toolCallResults: LlmToolCall[] = [];
      for (const tc of toolCalls.values()) {
        let parsedArgs: unknown = tc.arguments;
        try { parsedArgs = JSON.parse(tc.arguments); } catch {}
        toolCallResults.push({ id: tc.id, name: tc.name, arguments: parsedArgs });
      }

      yield {
        type: "done",
        response: {
          content,
          stopReason: mapFinishReason(finishReason),
          ...(toolCallResults.length > 0 ? { toolCalls: toolCallResults } : {}),
          ...(usage ? { usage } : {}),
        },
      };
      return;
    } catch (error) {
      const requestError = normalizeRequestError(error, signal);
      if (!shouldRetry({ error: requestError, attempts, maxRetries, signal: options.signal })) {
        yield { type: "error", error: requestError };
        yield { type: "done", response: { content: "", stopReason: "error" } };
        return;
      }
      await waitForRetry(retryDelayMs * 2 ** (attempts - 1), options.signal);
    } finally {
      cleanup();
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createOpenAICompletionsStream(config: OpenAICompletionsConfig): StreamFn {
  const normalizedConfig = { ...config, baseUrl: normalizeBaseUrl(config.baseUrl) };
  return async function* openAICompletionsStream(request, options) {
    yield* streamChatCompletions(normalizedConfig, request, options);
  };
}

/**
 * ApiStreamFn-compatible stream function for OpenAI Chat Completions API.
 * Resolves config from the Model descriptor and environment.
 */
export const streamOpenAICompletions: ApiStreamFn = (model, request, options) => {
  const config = resolveOpenAICompletionsConfig({
    baseUrl: model.baseUrl,
    model: model.id,
  });
  return streamChatCompletions(config, request, options);
};

export async function callOpenAICompletions(
  config: OpenAICompletionsConfig,
  request: LlmRequest,
  options: LlmStreamOptions = {},
): Promise<{ content: string; usage?: LlmTokenUsage }> {
  const maxRetries = normalizeRetryNumber(config.maxRetries, DEFAULT_MAX_RETRIES);
  const retryDelayMs = normalizeRetryNumber(config.retryDelayMs, DEFAULT_RETRY_DELAY_MS);
  const body = buildRequestBody(config, request, false);
  const fetchImpl = config.fetch ?? fetch;
  const endpoint = `${normalizeBaseUrl(config.baseUrl)}/chat/completions`;
  let attempts = 0;

  while (true) {
    attempts += 1;
    const { signal, cleanup } = createRequestSignal({ signal: options.signal, timeoutMs: config.timeoutMs });

    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        throw normalizeHttpError(response, await readErrorBody(response), { endpoint, model: config.model });
      }

      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string | null } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };

      return { content: data.choices?.[0]?.message?.content ?? "", usage: normalizeUsage(data.usage) };
    } catch (error) {
      const requestError = normalizeRequestError(error, signal);
      if (!shouldRetry({ error: requestError, attempts, maxRetries, signal: options.signal })) throw requestError;
      await waitForRetry(retryDelayMs * 2 ** (attempts - 1), options.signal);
    } finally {
      cleanup();
    }
  }
}
