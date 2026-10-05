import type {
  LlmMessage,
  LlmRequest,
  LlmStreamEvent,
  LlmTokenUsage,
  LlmToolChoice,
  LlmToolDefinition,
  ProviderCallContext,
  ProviderStreamFn,
  StreamFn,
  AssistantMessagePartial,
} from "../protocol";
import { createProviderCallContext } from "../protocol";
import { ContentBlockAccumulator, contentBlocksResponse } from "../content-blocks";
import { executeProviderRequest, streamProviderRequest } from "./http";
import {
  type BaseProviderConfig,
  normalizeBaseUrl,
  normalizeUsage,
  openAIReasoningEffort,
  payloadError,
  resolveBaseProviderConfig,
  sanitizeToolInput,
} from "./shared";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export type OpenAICompletionsConfig = BaseProviderConfig & {
  responseFormat?: boolean;
};

export type ResolveOpenAICompletionsConfigInput = Partial<OpenAICompletionsConfig>;

export function resolveOpenAICompletionsConfig(
  input: ResolveOpenAICompletionsConfigInput = {},
): OpenAICompletionsConfig {
  return {
    ...resolveBaseProviderConfig(input, "https://api.openai.com/v1"),
    ...(input.responseFormat !== undefined ? { responseFormat: input.responseFormat } : {}),
  };
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
              arguments: JSON.stringify(sanitizeToolInput(p.input)),
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

function convertToolChoice(choice: LlmToolChoice): unknown {
  return typeof choice === "string" ? choice : { type: "function", function: { name: choice.name } };
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

  // `max_tokens` is deprecated and rejected by reasoning models.
  if (request.maxTokens ?? config.maxTokens) {
    body.max_completion_tokens = request.maxTokens ?? config.maxTokens;
  }

  const thinkingLevel = request.thinkingLevel ?? config.thinkingLevel;
  if (thinkingLevel && thinkingLevel !== "off") {
    body.reasoning_effort = openAIReasoningEffort(thinkingLevel);
  }

  if (request.tools && request.tools.length > 0) {
    body.tools = convertTools(request.tools);
    if (request.toolChoice) body.tool_choice = convertToolChoice(request.toolChoice);
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
    case "tool_calls":
    case "function_call": return "tool_use";
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
      reasoning_content?: string | null;
      reasoning?: string | null;
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
      reasoning_content?: string | null;
      reasoning?: string | null;
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
  ctx?: ProviderCallContext,
): AsyncGenerator<LlmStreamEvent> {
  const body = buildRequestBody(config, request, true);
  const endpoint = `${normalizeBaseUrl(config.baseUrl)}/chat/completions`;

  yield* streamProviderRequest({
    config,
    endpoint,
    llmRequest: request,
    signal: ctx?.signal,
    request: () => ({
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    }),
  }, async function* (response) {
      // Non-streaming response
      if (!response.isEventStream) {
        const data = await response.json<ChatCompletionResponse>();
        const bodyError = payloadError(data);
        if (bodyError) throw bodyError;
        const choice = data.choices?.[0];
        const message = choice?.message;
        const accumulator = new ContentBlockAccumulator();
        const partial: AssistantMessagePartial = {
          role: "assistant",
          contentBlocks: [],
        };

        yield { type: "start", partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };

        const thinking = message?.reasoning_content ?? message?.reasoning ?? "";
        if (thinking) {
          accumulator.appendThinking(thinking);
          partial.contentBlocks = accumulator.snapshot();
          yield { type: "thinking_delta", thinking, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
        }
        if (message?.content) {
          accumulator.appendText(message.content);
          partial.contentBlocks = accumulator.snapshot();
          yield { type: "text_delta", text: message.content, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
        }
        for (const [index, tc] of (message?.tool_calls ?? []).entries()) {
          accumulator.startToolCall(`tool:${index}`, {
            type: "tool_call",
            id: tc.id ?? `call_${index}`,
            name: tc.function?.name ?? "",
            args: tc.function?.arguments ?? "",
          });
        }

        partial.contentBlocks = accumulator.snapshot();
        for (const block of partial.contentBlocks) {
          if (block.type !== "tool_call") continue;
          yield { type: "tool_call_start", id: block.id, name: block.name, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
          yield { type: "tool_call_end", id: block.id, name: block.name, arguments: block.args, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
        }

        const usage = normalizeUsage(data.usage);
        yield {
          type: "done",
          response: {
            ...contentBlocksResponse(accumulator.snapshot()),
            stopReason: mapFinishReason(choice?.finish_reason),
            ...(usage ? { usage } : {}),
          },
        };
        return;
      }

      let finishReason: string | null = null;
      let usage: LlmTokenUsage | undefined;
      const accumulator = new ContentBlockAccumulator();

      const partial: AssistantMessagePartial = {
        role: "assistant",
        contentBlocks: [],
      };

      function rebuildPartial(): void {
        partial.contentBlocks = accumulator.snapshot();
      }

      yield { type: "start", partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };

      for await (const sse of response.sse()) {
        if (sse.data === "[DONE]") break;

        let chunk: ChatCompletionChunk;
        try { chunk = JSON.parse(sse.data) as ChatCompletionChunk; } catch { continue; }

        // OpenAI-compatible gateways report a mid-stream failure as an error chunk.
        const streamError = payloadError(chunk);
        if (streamError) throw streamError;
        if (chunk.usage) usage = normalizeUsage(chunk.usage);

        const choice = chunk.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta;

        if (delta) {
          const reasoningDelta = delta.reasoning_content ?? delta.reasoning;
          if (reasoningDelta) {
            accumulator.appendThinking(reasoningDelta);
            rebuildPartial();
            yield { type: "thinking_delta", thinking: reasoningDelta, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
          }
          if (delta.content) {
            accumulator.appendText(delta.content);
            rebuildPartial();
            yield { type: "text_delta", text: delta.content, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
          }
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const key = `tool:${tc.index}`;
              let block = accumulator.block(key);
              if (!block) {
                accumulator.startToolCall(key, { type: "tool_call", id: tc.id ?? "", name: tc.function?.name ?? "", args: "" });
                if (tc.id || tc.function?.name) {
                  rebuildPartial();
                  yield { type: "tool_call_start", id: tc.id ?? "", name: tc.function?.name ?? "", partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
                }
              } else if (tc.id || tc.function?.name) {
                accumulator.updateToolCall(key, {
                  ...(tc.id ? { id: tc.id } : {}),
                  ...(tc.function?.name ? { name: tc.function.name } : {}),
                });
                rebuildPartial();
              }
              block = accumulator.block(key)!;
              if (block.type !== "tool_call") continue;
              if (tc.function?.arguments) {
                accumulator.setToolCallArguments(key, block.args + tc.function.arguments);
                rebuildPartial();
                yield { type: "tool_call_delta", id: block.id, arguments: tc.function.arguments, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
              }
            }
          }
        }
        if (choice.finish_reason) finishReason = choice.finish_reason;
      }

      for (const block of accumulator.snapshot()) {
        if (block.type !== "tool_call") continue;
        rebuildPartial();
        yield { type: "tool_call_end", id: block.id, name: block.name, arguments: block.args, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
      }

      yield {
        type: "done",
        response: {
          ...contentBlocksResponse(accumulator.snapshot()),
          stopReason: mapFinishReason(finishReason),
          ...(usage ? { usage } : {}),
        },
      };
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createOpenAICompletionsStream(config: OpenAICompletionsConfig): StreamFn {
  const normalizedConfig = { ...config, baseUrl: normalizeBaseUrl(config.baseUrl) };
  return async function* openAICompletionsStream(request, ctx) {
    const fullCtx: ProviderCallContext = ctx && "signal" in ctx && "run" in ctx && "emit" in ctx && "interact" in ctx && "tools" in ctx
      ? ctx as ProviderCallContext
      : createProviderCallContext(ctx);
    yield* streamChatCompletions(normalizedConfig, request, fullCtx);
  };
}

/**
 * ProviderStreamFn-compatible stream function for OpenAI Chat Completions API.
 * Resolves config from the Model descriptor and environment.
 */
export const streamOpenAICompletions: ProviderStreamFn = (model, request, ctx) => {
  const config = resolveOpenAICompletionsConfig({
    baseUrl: model.baseUrl,
    model: model.id,
    apiKey: model.apiKey,
    thinkingLevel: model.thinkingLevel,
    timeoutMs: model.timeoutMs,
    maxRetries: model.maxRetries,
    retryDelayMs: model.retryDelayMs,
    headers: model.headers,
  });
  return streamChatCompletions(config, request, ctx);
};

export async function callOpenAICompletions(
  config: OpenAICompletionsConfig,
  request: LlmRequest,
  options: { signal?: AbortSignal } = {},
): Promise<{ content: string; thinking?: string; usage?: LlmTokenUsage }> {
  const body = buildRequestBody(config, request, false);
  const endpoint = `${normalizeBaseUrl(config.baseUrl)}/chat/completions`;

  return executeProviderRequest({
    config,
    endpoint,
    signal: options.signal,
    request: () => ({
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    }),
  }, async (response) => {
    const data = await response.json<{
      choices?: Array<{ message?: { content?: string | null; reasoning_content?: string | null; reasoning?: string | null } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    }>();
    const message = data.choices?.[0]?.message;
    const thinking = message?.reasoning_content ?? message?.reasoning ?? "";
    return {
      content: message?.content ?? "",
      ...(thinking ? { thinking } : {}),
      usage: normalizeUsage(data.usage),
    };
  });
}
