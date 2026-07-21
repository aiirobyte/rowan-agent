import type {
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
  AssistantMessagePartial,
} from "../protocol";
import { streamProviderRequest } from "./http";
import {
  type BaseProviderConfig,
  normalizeBaseUrl,
  resolveBaseProviderConfig,
} from "./shared";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export type AnthropicConfig = Omit<BaseProviderConfig, "temperature"> & {
  thinking?: { budgetTokens: number };
};

export type ResolveAnthropicConfigInput = Partial<AnthropicConfig>;

const DEFAULT_MAX_TOKENS = 8192;

export function resolveAnthropicConfig(input: ResolveAnthropicConfigInput = {}): AnthropicConfig {
  return {
    ...resolveBaseProviderConfig(input, "https://api.anthropic.com"),
    ...(input.thinking ? { thinking: input.thinking } : {}),
  };
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
  const hasNonText = parts.some((p) => p.type !== "text");
  if (!hasNonText) {
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
    } else if (part.type === "tool_use") {
      blocks.push({ type: "tool_use", id: part.id, name: part.name, input: part.input });
    } else if (part.type === "tool_result") {
      blocks.push({ type: "tool_result", tool_use_id: part.toolUseId, content: part.content, is_error: part.isError });
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
        // Check for tool_use blocks - if present, use content blocks directly
        const hasToolUse = msg.content.some((p) => p.type === "tool_use");
        if (hasToolUse) {
          result.push({ role: "assistant", content: convertContentParts(msg.content) });
        } else {
          const texts = msg.content
            .filter((p): p is { type: "text"; text: string } => p.type === "text")
            .map((p) => p.text);
          result.push({ role: "assistant", content: texts.join("\n") });
        }
      }
    } else if (msg.role === "tool") {
      // Anthropic requires tool_result blocks inside a user message
      if (typeof msg.content === "string") {
        result.push({ role: "user", content: msg.content });
      } else {
        result.push({ role: "user", content: convertContentParts(msg.content) });
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
  const body = buildRequestBody(config, request);
  const endpoint = `${normalizeBaseUrl(config.baseUrl)}/v1/messages`;

  yield* streamProviderRequest({
    config,
    endpoint,
    llmRequest: request,
    requestName: "Anthropic request",
    signal: options.signal,
    request: () => ({
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    }),
  }, async function* (response) {
      let content = "";
      let thinking = "";
      let stopReason: string | null = null;
      let inputTokens = 0;
      let outputTokens = 0;
      const toolCalls = new Map<number, { id: string; name: string; arguments: string }>();
      const blockTypes = new Map<number, "text" | "thinking" | "tool_use">();

      const partial: AssistantMessagePartial = {
        role: "assistant",
        contentBlocks: [],
      };

      function rebuildPartial(): void {
        partial.contentBlocks = [];
        if (thinking) {
          partial.contentBlocks.push({ type: "thinking", thinking });
        }
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

      for await (const sse of response.sse()) {
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
              rebuildPartial();
              yield { type: "tool_call_start", id: tc.id, name: tc.name, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
            }
            break;

          case "content_block_delta":
            if (event.delta.type === "text_delta") {
              content += event.delta.text;
              rebuildPartial();
              yield { type: "text_delta", text: event.delta.text, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
            } else if (event.delta.type === "thinking_delta") {
              thinking += event.delta.thinking;
              rebuildPartial();
              yield { type: "thinking_delta", thinking: event.delta.thinking, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
            } else if (event.delta.type === "input_json_delta") {
              const tc = toolCalls.get(event.index);
              if (tc) {
                tc.arguments += event.delta.partial_json;
                rebuildPartial();
                yield { type: "tool_call_delta", id: tc.id, arguments: event.delta.partial_json, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
              }
            }
            break;

          case "content_block_stop": {
            if (blockTypes.get(event.index) === "tool_use") {
              const tc = toolCalls.get(event.index);
              if (tc) {
                rebuildPartial();
                yield { type: "tool_call_end", id: tc.id, name: tc.name, arguments: tc.arguments, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
              }
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
  });
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
    apiKey: model.apiKey,
    timeoutMs: model.timeoutMs,
    maxRetries: model.maxRetries,
    retryDelayMs: model.retryDelayMs,
    headers: model.headers,
  });
  return streamAnthropicMessages(config, request, options);
};
