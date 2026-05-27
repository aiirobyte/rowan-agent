import type {
  Model,
  LlmContentPart,
  LlmMessage,
  LlmRequest,
  LlmStreamEvent,
  LlmTokenUsage,
  LlmStreamOptions,
  LlmToolCall,
  LlmToolDefinition,
  StreamFn,
  ApiStreamFn,
} from "../protocol";
import { iterateSseMessages } from "../sse";
import {
  ProviderError,
  type ProviderFetch,
  normalizeBaseUrl,
  nonEmpty,
  requireValue,
  defaultEnv,
  createRequestSignal,
  readErrorBody,
  isRetryableStatus,
  normalizeRequestError,
  summarizeRequestUsage,
  normalizeRetryNumber,
  shouldRetry,
  waitForRetry,
  DEFAULT_MAX_RETRIES,
  DEFAULT_RETRY_DELAY_MS,
  isRecord,
  asTrimmedString,
} from "./shared";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export type AnthropicConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  fetch?: ProviderFetch;
  thinking?: { budgetTokens: number };
};

export type ResolveAnthropicConfigInput = {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  fetch?: ProviderFetch;
  thinking?: { budgetTokens: number };
  env?: Record<string, string | undefined>;
};

const DEFAULT_MAX_TOKENS = 8192;

export function resolveAnthropicConfig(input: ResolveAnthropicConfigInput = {}): AnthropicConfig {
  const env = input.env ?? defaultEnv();
  const baseUrl =
    nonEmpty(input.baseUrl) ?? nonEmpty(env.ROWAN_ANTHROPIC_BASE_URL) ?? "https://api.anthropic.com";
  const apiKey = nonEmpty(input.apiKey) ?? nonEmpty(env.ROWAN_ANTHROPIC_API_KEY) ?? nonEmpty(env.ANTHROPIC_API_KEY);
  const model = nonEmpty(input.model) ?? nonEmpty(env.ROWAN_MODEL);

  return {
    baseUrl: normalizeBaseUrl(baseUrl),
    apiKey: requireValue("API key", apiKey, "set ROWAN_ANTHROPIC_API_KEY or pass --api-key"),
    model: requireValue("model", model, "set ROWAN_MODEL or pass --model"),
    ...(input.maxTokens !== undefined ? { maxTokens: input.maxTokens } : {}),
    ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
    ...(input.maxRetries !== undefined ? { maxRetries: input.maxRetries } : {}),
    ...(input.retryDelayMs !== undefined ? { retryDelayMs: input.retryDelayMs } : {}),
    ...(input.fetch ? { fetch: input.fetch } : {}),
    ...(input.thinking ? { thinking: input.thinking } : {}),
  };
}

// ---------------------------------------------------------------------------
// HTTP error
// ---------------------------------------------------------------------------

function normalizeHttpError(response: Response, body: unknown): ProviderError {
  let providerMessage: string | undefined;
  if (isRecord(body) && isRecord(body.error)) {
    providerMessage = asTrimmedString(body.error.message);
  }

  const statusSummary = response.statusText
    ? `${response.status} ${response.statusText}`
    : String(response.status);
  const message = providerMessage
    ? `Anthropic request failed (${statusSummary}): ${providerMessage}`
    : `Anthropic request failed with status ${statusSummary}.`;

  return new ProviderError({
    code: "http_error",
    message,
    status: response.status,
    retryable: isRetryableStatus(response.status),
    details: { status: response.status, ...(isRecord(body) ? { providerError: body.error } : {}) },
  });
}

// ---------------------------------------------------------------------------
// Message conversion
// ---------------------------------------------------------------------------

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

type AnthropicMessage =
  | { role: "user"; content: string | AnthropicContentBlock[] }
  | { role: "assistant"; content: string | AnthropicContentBlock[] };

function convertContentParts(parts: LlmContentPart[]): string | AnthropicContentBlock[] {
  const hasImages = parts.some((p) => p.type === "image");
  if (!hasImages) {
    return parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("\n");
  }

  const blocks: AnthropicContentBlock[] = [];
  for (const part of parts) {
    if (part.type === "text") {
      blocks.push({ type: "text", text: part.text });
    } else if (part.type === "image") {
      blocks.push({
        type: "image",
        source: { type: "base64", media_type: part.mimeType, data: part.data },
      });
    }
  }
  return blocks;
}

function convertMessages(messages: LlmMessage[]): AnthropicMessage[] {
  const result: AnthropicMessage[] = [];
  for (const msg of messages) {
    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        result.push({ role: "user", content: msg.content });
      } else {
        result.push({ role: "user", content: convertContentParts(msg.content) });
      }
    } else if (msg.role === "assistant") {
      if (typeof msg.content === "string") {
        result.push({ role: "assistant", content: msg.content });
      } else {
        const texts = msg.content
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text);
        result.push({ role: "assistant", content: texts.join("\n") });
      }
    }
  }
  return result;
}

function convertTools(tools: LlmToolDefinition[]): Array<{
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required: string[] };
}> {
  return tools.map((tool) => {
    const schema = (tool.parameters ?? {}) as { properties?: Record<string, unknown>; required?: string[] };
    return {
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: "object" as const,
        properties: schema.properties ?? {},
        required: schema.required ?? [],
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Body construction
// ---------------------------------------------------------------------------

function buildRequestBody(config: AnthropicConfig, request: LlmRequest): Record<string, unknown> {
  const messages = convertMessages(request.messages);
  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    max_tokens: request.maxTokens ?? config.maxTokens ?? DEFAULT_MAX_TOKENS,
    stream: true,
  };

  if (request.system) body.system = request.system;
  if (request.temperature !== undefined) body.temperature = request.temperature;
  if (request.tools && request.tools.length > 0) body.tools = convertTools(request.tools);
  if (config.thinking) {
    body.thinking = { type: "enabled", budget_tokens: config.thinking.budgetTokens };
  }

  return body;
}

// ---------------------------------------------------------------------------
// Stop reason mapping
// ---------------------------------------------------------------------------

function mapStopReason(reason: string): "end_turn" | "max_tokens" | "tool_use" | "stop" | "unknown" {
  switch (reason) {
    case "end_turn": return "end_turn";
    case "max_tokens": return "max_tokens";
    case "tool_use": return "tool_use";
    case "stop_sequence": return "stop";
    default: return "unknown";
  }
}

// ---------------------------------------------------------------------------
// SSE event types
// ---------------------------------------------------------------------------

type AnthropicStreamEvent =
  | { type: "message_start"; message: { id: string; usage: { input_tokens: number; output_tokens: number } } }
  | { type: "content_block_start"; index: number; content_block: { type: "text" | "thinking" | "tool_use"; id?: string; name?: string } }
  | { type: "content_block_delta"; index: number; delta: { type: "text_delta"; text: string } | { type: "thinking_delta"; thinking: string } | { type: "input_json_delta"; partial_json: string } }
  | { type: "content_block_stop"; index: number }
  | { type: "message_delta"; delta: { stop_reason: string | null }; usage: { output_tokens: number } }
  | { type: "message_stop" };

const MESSAGE_EVENTS = new Set([
  "message_start", "message_delta", "message_stop",
  "content_block_start", "content_block_delta", "content_block_stop",
]);

// ---------------------------------------------------------------------------
// Streaming
// ---------------------------------------------------------------------------

async function* streamAnthropicMessages(
  config: AnthropicConfig,
  request: LlmRequest,
  options: LlmStreamOptions = {},
): AsyncGenerator<LlmStreamEvent> {
  const maxRetries = normalizeRetryNumber(config.maxRetries, DEFAULT_MAX_RETRIES);
  const retryDelayMs = normalizeRetryNumber(config.retryDelayMs, DEFAULT_RETRY_DELAY_MS);
  const body = buildRequestBody(config, request);
  const fetchImpl = config.fetch ?? fetch;
  const endpoint = `${normalizeBaseUrl(config.baseUrl)}/v1/messages`;
  const requestUsage = summarizeRequestUsage(request);
  let attempts = 0;

  while (true) {
    attempts += 1;
    const { signal, cleanup } = createRequestSignal({ signal: options.signal, timeoutMs: config.timeoutMs });

    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) throw normalizeHttpError(response, await readErrorBody(response));
      if (!response.body) {
        throw new ProviderError({ code: "no_body", message: "Response body is null.", retryable: true });
      }

      yield { type: "model_requested", model: request.model, usage: { ...requestUsage } };

      let content = "";
      let thinking = "";
      let stopReason: string | null = null;
      let inputTokens = 0;
      let outputTokens = 0;
      const toolCalls = new Map<number, { id: string; name: string; arguments: string }>();
      const blockTypes = new Map<number, "text" | "thinking" | "tool_use">();

      for await (const sse of iterateSseMessages(response.body, signal)) {
        if (!sse.event || !MESSAGE_EVENTS.has(sse.event)) continue;

        let event: AnthropicStreamEvent;
        try { event = JSON.parse(sse.data) as AnthropicStreamEvent; } catch { continue; }

        switch (event.type) {
          case "message_start":
            inputTokens = event.message.usage.input_tokens;
            outputTokens = event.message.usage.output_tokens;
            break;

          case "content_block_start":
            blockTypes.set(event.index, event.content_block.type);
            if (event.content_block.type === "tool_use") {
              const tc = { id: event.content_block.id ?? "", name: event.content_block.name ?? "", arguments: "" };
              toolCalls.set(event.index, tc);
              yield { type: "tool_call_start", id: tc.id, name: tc.name };
            }
            break;

          case "content_block_delta":
            if (event.delta.type === "text_delta") {
              content += event.delta.text;
              yield { type: "text_delta", text: event.delta.text };
            } else if (event.delta.type === "thinking_delta") {
              thinking += event.delta.thinking;
              yield { type: "thinking_delta", thinking: event.delta.thinking };
            } else if (event.delta.type === "input_json_delta") {
              const tc = toolCalls.get(event.index);
              if (tc) {
                tc.arguments += event.delta.partial_json;
                yield { type: "tool_call_delta", id: tc.id, arguments: event.delta.partial_json };
              }
            }
            break;

          case "content_block_stop": {
            if (blockTypes.get(event.index) === "tool_use") {
              const tc = toolCalls.get(event.index);
              if (tc) yield { type: "tool_call_end", id: tc.id, name: tc.name, arguments: tc.arguments };
            }
            break;
          }

          case "message_delta":
            if (event.delta.stop_reason) stopReason = event.delta.stop_reason;
            outputTokens = event.usage.output_tokens;
            break;

          case "message_stop":
            break;
        }
      }

      const toolCallResults: LlmToolCall[] = [];
      for (const tc of toolCalls.values()) {
        let parsedArgs: unknown = tc.arguments;
        try { parsedArgs = JSON.parse(tc.arguments); } catch {}
        toolCallResults.push({ id: tc.id, name: tc.name, arguments: parsedArgs });
      }

      const usage: LlmTokenUsage = { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };

      yield {
        type: "done",
        response: {
          content,
          ...(thinking ? { thinking } : {}),
          stopReason: mapStopReason(stopReason ?? "end_turn"),
          ...(toolCallResults.length > 0 ? { toolCalls: toolCallResults } : {}),
          usage,
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

export function createAnthropicStream(config: AnthropicConfig): StreamFn {
  const normalizedConfig = { ...config, baseUrl: normalizeBaseUrl(config.baseUrl) };
  return async function* anthropicStream(request, options) {
    yield* streamAnthropicMessages(normalizedConfig, request, options);
  };
}

/**
 * ApiStreamFn-compatible stream function for Anthropic Messages API.
 * Resolves config from the Model descriptor and environment.
 */
export const streamAnthropic: ApiStreamFn = (model, request, options) => {
  const config = resolveAnthropicConfig({
    baseUrl: model.baseUrl,
    model: model.id,
  });
  return streamAnthropicMessages(config, request, options);
};
