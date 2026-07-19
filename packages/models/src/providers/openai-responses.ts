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
  sanitizeToolInput,
} from "./shared";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export type OpenAIResponsesConfig = BaseProviderConfig & {
  reasoningEffort?: "low" | "medium" | "high";
};

export type ResolveOpenAIResponsesConfigInput = {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  fetch?: ProviderFetch;
  reasoningEffort?: "low" | "medium" | "high";
};

export function resolveOpenAIResponsesConfig(
  input: ResolveOpenAIResponsesConfigInput = {},
): OpenAIResponsesConfig {
  const baseUrl = nonEmpty(input.baseUrl) ?? "https://api.openai.com/v1";
  const apiKey = nonEmpty(input.apiKey);
  const model = nonEmpty(input.model);

  return {
    baseUrl: normalizeBaseUrl(baseUrl),
    apiKey: requireValue("API key", apiKey, "model.apiKey is required (set apiKey in config.yaml or pass --api-key)"),
    model: requireValue("model", model, "model.id is required"),
    ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
    ...(input.maxTokens !== undefined ? { maxTokens: input.maxTokens } : {}),
    ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
    ...(input.maxRetries !== undefined ? { maxRetries: input.maxRetries } : {}),
    ...(input.retryDelayMs !== undefined ? { retryDelayMs: input.retryDelayMs } : {}),
    ...(input.fetch ? { fetch: input.fetch } : {}),
    ...(input.reasoningEffort !== undefined ? { reasoningEffort: input.reasoningEffort } : {}),
  };
}

// ---------------------------------------------------------------------------
// HTTP error
// ---------------------------------------------------------------------------

function normalizeHttpError(
  response: Response,
  body: unknown,
  context: { endpoint: string; model: string },
): ProviderError {
  let providerMessage: string | undefined;
  if (isRecord(body) && isRecord(body.error)) {
    providerMessage = asTrimmedString(body.error.message);
  }

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
    details: { endpoint: context.endpoint, model: context.model, status: response.status, ...(isRecord(body) ? { providerError: body.error } : {}) },
  });
}

// ---------------------------------------------------------------------------
// Message / tool conversion for Responses API
// ---------------------------------------------------------------------------

type ResponsesInputMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string }
  | { type: "function_call"; call_id: string; name: string; arguments: string }
  | { type: "function_call_output"; call_id: string; output: string };

function convertMessages(messages: LlmMessage[]): ResponsesInputMessage[] {
  const result: ResponsesInputMessage[] = [];
  for (const msg of messages) {
    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        result.push({ role: "user", content: msg.content });
      } else {
        const text = msg.content
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join("\n");
        if (text) result.push({ role: "user", content: text });
      }
    } else if (msg.role === "assistant") {
      if (typeof msg.content === "string") {
        result.push({ role: "assistant", content: msg.content });
      } else {
        // Emit text content
        const text = msg.content
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join("\n");
        if (text) result.push({ role: "assistant", content: text });

        // Emit function_call items for tool_use blocks
        for (const part of msg.content) {
          if (part.type === "tool_use") {
            result.push({
              type: "function_call",
              call_id: part.id,
              name: part.name,
              arguments: JSON.stringify(sanitizeToolInput(part.input)),
            });
          }
        }
      }
    } else if (msg.role === "tool") {
      // Emit function_call_output items for tool_result blocks
      if (typeof msg.content === "string") {
        result.push({ type: "function_call_output", call_id: "", output: msg.content });
      } else {
        for (const part of msg.content) {
          if (part.type === "tool_result") {
            result.push({
              type: "function_call_output",
              call_id: part.toolUseId,
              output: part.content,
            });
          }
        }
      }
    }
  }
  return result;
}

function convertTools(tools: LlmToolDefinition[]): Array<{
  type: "function";
  name: string;
  description: string;
  parameters: unknown;
  strict: boolean;
}> {
  return tools.map((tool) => ({
    type: "function" as const,
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    strict: false,
  }));
}

// ---------------------------------------------------------------------------
// Body construction for Responses API
// ---------------------------------------------------------------------------

function buildRequestBody(
  config: OpenAIResponsesConfig,
  request: LlmRequest,
): Record<string, unknown> {
  const input = convertMessages(request.messages);

  const body: Record<string, unknown> = {
    model: config.model,
    input,
    stream: true,
  };

  if (request.system) {
    body.instructions = request.system;
  }

  if (request.maxTokens ?? config.maxTokens) {
    body.max_output_tokens = request.maxTokens ?? config.maxTokens;
  }

  if (request.tools && request.tools.length > 0) {
    body.tools = convertTools(request.tools);
  }

  if (config.reasoningEffort) {
    body.reasoning = { effort: config.reasoningEffort, summary: "auto" };
  }

  return body;
}

// ---------------------------------------------------------------------------
// Stop reason mapping
// ---------------------------------------------------------------------------

function mapStopReason(reason: string | null | undefined): "end_turn" | "max_tokens" | "tool_use" | "error" | "unknown" {
  switch (reason) {
    case "completed": return "end_turn";
    case "max_tokens": return "max_tokens";
    case "incomplete": return "max_tokens";
    default: return "unknown";
  }
}

// ---------------------------------------------------------------------------
// SSE event types for Responses API
// ---------------------------------------------------------------------------

type ResponsesStreamEvent =
  | { type: "response.created"; response: { id: string } }
  | { type: "response.output_item.added"; output_index: number; item: { type: string; id?: string; call_id?: string; name?: string } }
  | { type: "response.content_part.added"; output_index: number; content_index: number; part: { type: string } }
  | { type: "response.output_text.delta"; output_index: number; content_index: number; delta: string }
  | { type: "response.output_text.done"; output_index: number; content_index: number; text: string }
  | { type: "response.function_call_arguments.delta"; output_index: number; item_id: string; call_id?: string; delta: string }
  | { type: "response.function_call_arguments.done"; output_index: number; item_id: string; call_id?: string; name?: string; arguments: string }
  | { type: "response.output_item.done"; output_index: number; item: { type: string; id?: string; call_id?: string; name?: string; arguments?: string } }
  | { type: "response.completed"; response: { usage?: { input_tokens: number; output_tokens: number; total_tokens: number } } }
  | { type: "response.incomplete"; response: { usage?: { input_tokens: number; output_tokens: number; total_tokens: number }; incomplete_details?: { reason: string } } }
  | { type: "error"; error: { message: string; type?: string } };

// ---------------------------------------------------------------------------
// Streaming
// ---------------------------------------------------------------------------

async function* streamResponses(
  config: OpenAIResponsesConfig,
  request: LlmRequest,
  options: LlmStreamOptions = {},
): AsyncGenerator<LlmStreamEvent> {
  const maxRetries = normalizeRetryNumber(config.maxRetries, DEFAULT_MAX_RETRIES);
  const retryDelayMs = normalizeRetryNumber(config.retryDelayMs, DEFAULT_RETRY_DELAY_MS);
  const body = buildRequestBody(config, request);
  const fetchImpl = config.fetch ?? fetch;
  const endpoint = `${normalizeBaseUrl(config.baseUrl)}/responses`;
  const requestUsage = summarizeRequestUsage(request);
  let attempts = 0;

  while (true) {
    attempts += 1;
    const { signal, onActivity, cleanup } = createRequestSignal({
      signal: options.signal,
      timeoutMs: config.timeoutMs,
    });
    let hasPartialOutput = false;

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

      let content = "";
      let stopReason: string | null = null;
      let usage: LlmTokenUsage | undefined;
      // Map output_index -> tool call state
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

      for await (const sse of iterateSseMessages(response.body, signal, onActivity)) {
        let event: ResponsesStreamEvent;
        try { event = JSON.parse(sse.data) as ResponsesStreamEvent; } catch { continue; }

        switch (event.type) {
          case "response.output_text.delta":
            content += event.delta;
            rebuildPartial();
            hasPartialOutput = true;
            yield { type: "text_delta", text: event.delta, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
            break;

          case "response.output_item.added":
            if (event.item.type === "function_call") {
              const tc = { id: event.item.call_id ?? event.item.id ?? "", name: event.item.name ?? "", arguments: "" };
              toolCalls.set(event.output_index, tc);
              rebuildPartial();
              hasPartialOutput = true;
              yield { type: "tool_call_start", id: tc.id, name: tc.name, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
            }
            break;

          case "response.function_call_arguments.delta": {
            const tc = toolCalls.get(event.output_index);
            if (tc) {
              if (event.call_id) tc.id = event.call_id;
              tc.arguments += event.delta;
              rebuildPartial();
              hasPartialOutput = true;
              yield { type: "tool_call_delta", id: tc.id, arguments: event.delta, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
            }
            break;
          }

          case "response.function_call_arguments.done": {
            const tc = toolCalls.get(event.output_index);
            if (tc) {
              if (event.call_id) tc.id = event.call_id;
              if (event.name) tc.name = event.name;
              tc.arguments = event.arguments;
            }
            break;
          }

          case "response.output_item.done": {
            if (event.item.type === "function_call") {
              const tc = toolCalls.get(event.output_index);
              if (tc) {
                if (event.item.call_id) tc.id = event.item.call_id;
                if (event.item.name) tc.name = event.item.name;
                if (event.item.arguments) tc.arguments = event.item.arguments;
                rebuildPartial();
                hasPartialOutput = true;
                yield { type: "tool_call_end", id: tc.id, name: tc.name, arguments: tc.arguments, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
              }
            }
            break;
          }

          case "response.completed":
            if (event.response.usage) {
              usage = {
                inputTokens: event.response.usage.input_tokens,
                outputTokens: event.response.usage.output_tokens,
                totalTokens: event.response.usage.total_tokens,
              };
            }
            stopReason = "completed";
            break;

          case "response.incomplete":
            if (event.response.usage) {
              usage = {
                inputTokens: event.response.usage.input_tokens,
                outputTokens: event.response.usage.output_tokens,
                totalTokens: event.response.usage.total_tokens,
              };
            }
            stopReason = event.response.incomplete_details?.reason ?? "incomplete";
            break;

          case "error":
            throw new ProviderError({
              code: "stream_error",
              message: event.error.message,
              details: { type: event.error.type },
            });
        }
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
          stopReason: mapStopReason(stopReason),
          ...(toolCallResults.length > 0 ? { toolCalls: toolCallResults } : {}),
          ...(usage ? { usage } : {}),
        },
      };
      return;
    } catch (error) {
      const requestError = normalizeRequestError(error, signal);
      if (hasPartialOutput || !shouldRetry({ error: requestError, attempts, maxRetries, signal: options.signal })) {
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

export function createOpenAIResponsesStream(config: OpenAIResponsesConfig): StreamFn {
  const normalizedConfig = { ...config, baseUrl: normalizeBaseUrl(config.baseUrl) };
  return async function* openAIResponsesStream(request, options) {
    yield* streamResponses(normalizedConfig, request, options);
  };
}

/**
 * ApiStreamFn-compatible stream function for OpenAI Responses API.
 * Resolves config from the Model descriptor and environment.
 */
export const streamOpenAIResponses: ApiStreamFn = (model, request, options) => {
  const config = resolveOpenAIResponsesConfig({
    baseUrl: model.baseUrl,
    model: model.id,
    apiKey: model.apiKey,
    timeoutMs: model.timeoutMs,
    maxRetries: model.maxRetries,
    retryDelayMs: model.retryDelayMs,
  });
  return streamResponses(config, request, options);
};
