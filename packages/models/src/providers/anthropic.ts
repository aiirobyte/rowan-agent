import type {
  LlmContentPart,
  LlmMessage,
  LlmRequest,
  LlmStopReason,
  LlmStreamEvent,
  LlmTokenUsage,
  LlmToolChoice,
  LlmToolDefinition,
  ProviderCallContext,
  ProviderStreamFn,
  StreamFn,
  AssistantMessagePartial,
  ThinkingLevel,
} from "../protocol";
import { createProviderCallContext } from "../protocol";
import { ContentBlockAccumulator, contentBlocksResponse } from "../content-blocks";
import { streamProviderRequest } from "./http";
import {
  type BaseProviderConfig,
  normalizeBaseUrl,
  payloadError,
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
const DEFAULT_THINKING_BUDGETS: Record<Exclude<ThinkingLevel, "off">, number> = {
  minimal: 1024,
  low: 2048,
  medium: 8192,
  high: 16384,
  xhigh: 16384,
  max: 16384,
};
const EFFORTS: Record<Exclude<ThinkingLevel, "off">, "low" | "medium" | "high" | "xhigh" | "max"> = {
  minimal: "low",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: "max",
};

/** Redacted thinking travels in the portable signature slot with this prefix. */
const REDACTED_PREFIX = "anthropic-redacted:";

/**
 * Claude 4.6 and later reason with adaptive thinking plus `output_config.effort`;
 * `budget_tokens` is rejected from 4.7 on. Earlier and unknown models keep the
 * budget form, which Anthropic-compatible gateways also accept.
 */
function usesAdaptiveThinking(model: string): boolean {
  return /claude-(?:opus|sonnet)-4-(?:[6-9]|\d{2})|claude-(?:opus|sonnet|fable|mythos)-[5-9]/.test(model);
}

function thinkingBudgetForLevel(level: ThinkingLevel, maxTokens: number): number | undefined {
  if (level === "off") return undefined;
  const available = Math.max(0, maxTokens - 1024);
  const budget = Math.min(DEFAULT_THINKING_BUDGETS[level], available);
  return budget >= 1024 ? budget : undefined;
}

type ThinkingRequest =
  | { type: "adaptive"; effort: "low" | "medium" | "high" | "xhigh" | "max" }
  | { type: "enabled"; budgetTokens: number };

function resolveThinking(config: AnthropicConfig, request: LlmRequest, maxTokens: number): ThinkingRequest | undefined {
  const level = request.thinkingLevel ?? (config.thinking ? undefined : config.thinkingLevel);
  if (level === undefined) {
    if (!config.thinking) return undefined;
    return usesAdaptiveThinking(config.model)
      ? { type: "adaptive", effort: "high" }
      : { type: "enabled", budgetTokens: config.thinking.budgetTokens };
  }
  if (level === "off") return undefined;
  if (usesAdaptiveThinking(config.model)) return { type: "adaptive", effort: EFFORTS[level] };
  const budgetTokens = thinkingBudgetForLevel(level, maxTokens);
  return budgetTokens === undefined ? undefined : { type: "enabled", budgetTokens };
}

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
  | { type: "thinking"; thinking: string; signature: string }
  | { type: "redacted_thinking"; data: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

type AnthropicMessage =
  | { role: "user"; content: string | AnthropicContentBlock[] }
  | { role: "assistant"; content: string | AnthropicContentBlock[] };

function convertContentPart(part: LlmContentPart): AnthropicContentBlock | undefined {
  switch (part.type) {
    case "text":
      return { type: "text", text: part.text };
    case "image":
      return { type: "image", source: { type: "base64", media_type: part.mimeType, data: part.data } };
    case "thinking":
      // Only a block Anthropic signed can be replayed; any other is dropped.
      if (!part.signature || part.signature.includes(":") && !part.signature.startsWith(REDACTED_PREFIX)) return undefined;
      return part.signature.startsWith(REDACTED_PREFIX)
        ? { type: "redacted_thinking", data: part.signature.slice(REDACTED_PREFIX.length) }
        : { type: "thinking", thinking: part.thinking, signature: part.signature };
    case "tool_use":
      return { type: "tool_use", id: part.id, name: part.name, input: part.input };
    case "tool_result":
      return { type: "tool_result", tool_use_id: part.toolUseId, content: part.content, ...(part.isError ? { is_error: true } : {}) };
  }
}

function convertContent(content: string | LlmContentPart[]): string | AnthropicContentBlock[] {
  if (typeof content === "string") return content;
  const blocks = content.flatMap((part) => convertContentPart(part) ?? []);
  return blocks.every((block) => block.type === "text")
    ? blocks.map((block) => (block as { text: string }).text).join("\n")
    : blocks;
}

function convertMessages(messages: LlmMessage[]): AnthropicMessage[] {
  // Anthropic carries tool results inside a user message.
  return messages.map((msg) => ({
    role: msg.role === "assistant" ? "assistant" : "user",
    content: convertContent(msg.content),
  }));
}

function convertTools(tools: LlmToolDefinition[]): Array<{
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}> {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: "object",
      properties: {},
      ...((tool.parameters ?? {}) as Record<string, unknown>),
    },
  }));
}

function convertToolChoice(choice: LlmToolChoice): Record<string, unknown> {
  if (choice === "auto") return { type: "auto" };
  if (choice === "required") return { type: "any" };
  if (choice === "none") return { type: "none" };
  return { type: "tool", name: choice.name };
}

// ---------------------------------------------------------------------------
// Body construction
// ---------------------------------------------------------------------------

function buildRequestBody(config: AnthropicConfig, request: LlmRequest): Record<string, unknown> {
  const maxTokens = request.maxTokens ?? config.maxTokens ?? DEFAULT_MAX_TOKENS;
  const body: Record<string, unknown> = {
    model: config.model,
    messages: convertMessages(request.messages),
    max_tokens: maxTokens,
    stream: true,
  };

  if (request.system) body.system = request.system;
  if (request.tools && request.tools.length > 0) {
    body.tools = convertTools(request.tools);
    if (request.toolChoice) body.tool_choice = convertToolChoice(request.toolChoice);
  }
  const thinking = resolveThinking(config, request, maxTokens);
  if (thinking?.type === "adaptive") {
    body.thinking = { type: "adaptive", display: "summarized" };
    body.output_config = { effort: thinking.effort };
  } else if (thinking) {
    body.thinking = { type: "enabled", budget_tokens: thinking.budgetTokens };
  }
  // Sampling parameters are incompatible with thinking and removed on 4.7+.
  if (request.temperature !== undefined && !thinking && !usesAdaptiveThinking(config.model)) {
    body.temperature = request.temperature;
  }

  return body;
}

// ---------------------------------------------------------------------------
// Stop reason mapping
// ---------------------------------------------------------------------------

function mapStopReason(reason: string): LlmStopReason {
  switch (reason) {
    case "end_turn": return "end_turn";
    case "max_tokens":
    case "model_context_window_exceeded": return "max_tokens";
    case "tool_use": return "tool_use";
    case "stop_sequence": return "stop";
    case "refusal": return "error";
    default: return "unknown";
  }
}

// ---------------------------------------------------------------------------
// SSE event types
// ---------------------------------------------------------------------------

type AnthropicUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

type AnthropicStreamEvent =
  | { type: "message_start"; message: { id: string; usage: AnthropicUsage } }
  | { type: "content_block_start"; index: number; content_block: { type: string; id?: string; name?: string; data?: string } }
  | { type: "content_block_delta"; index: number; delta:
      | { type: "text_delta"; text: string }
      | { type: "thinking_delta"; thinking: string }
      | { type: "signature_delta"; signature: string }
      | { type: "input_json_delta"; partial_json: string } }
  | { type: "content_block_stop"; index: number }
  | { type: "message_delta"; delta: { stop_reason: string | null }; usage: AnthropicUsage }
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
  ctx?: ProviderCallContext,
): AsyncGenerator<LlmStreamEvent> {
  const body = buildRequestBody(config, request);
  const endpoint = `${normalizeBaseUrl(config.baseUrl)}/v1/messages`;

  yield* streamProviderRequest({
    config,
    endpoint,
    llmRequest: request,
    requestName: "Anthropic request",
    signal: ctx?.signal,
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
      let stopReason: string | null = null;
      const usage: LlmTokenUsage = {};
      // Provider block indices map onto accumulator keys, so interleaved
      // thinking keeps its place in one ordered assembly.
      const accumulator = new ContentBlockAccumulator();
      const blockKey = (index: number): string => `anthropic:${index}`;

      const partial: AssistantMessagePartial = {
        role: "assistant",
        contentBlocks: [],
      };
      const snapshot = (): AssistantMessagePartial => {
        partial.contentBlocks = accumulator.snapshot();
        return { ...partial, contentBlocks: [...partial.contentBlocks] };
      };
      const addUsage = (next: AnthropicUsage): void => {
        if (next.input_tokens != null) usage.inputTokens = next.input_tokens;
        if (next.output_tokens != null) usage.outputTokens = next.output_tokens;
        if (next.cache_read_input_tokens != null) usage.cacheReadTokens = next.cache_read_input_tokens;
        if (next.cache_creation_input_tokens != null) usage.cacheWriteTokens = next.cache_creation_input_tokens;
      };

      // Anthropic emits thinking before any text/tool block. Start the
      // assistant message before consuming content so a thinking-only or
      // interrupted response can still be persisted by the loop collector.
      yield { type: "start", partial: snapshot() };

      for await (const sse of response.sse()) {
        if (sse.event === "error") {
          let payload: unknown;
          try { payload = JSON.parse(sse.data); } catch { payload = { error: sse.data }; }
          throw payloadError(payload) ?? payloadError({ error: sse.data })!;
        }
        if (!sse.event || !MESSAGE_EVENTS.has(sse.event)) continue;

        let event: AnthropicStreamEvent;
        try { event = JSON.parse(sse.data) as AnthropicStreamEvent; } catch { continue; }

        switch (event.type) {
          case "message_start":
            addUsage(event.message.usage);
            break;

          case "content_block_start": {
            const start = event.content_block;
            const key = blockKey(event.index);
            if (start.type === "text") {
              accumulator.startText(key);
            } else if (start.type === "thinking") {
              accumulator.startThinking(key);
            } else if (start.type === "redacted_thinking") {
              accumulator.startThinking(key, `${REDACTED_PREFIX}${start.data ?? ""}`);
            } else if (start.type === "tool_use") {
              const block = { type: "tool_call" as const, id: start.id ?? "", name: start.name ?? "", args: "" };
              accumulator.startToolCall(key, block);
              yield { type: "tool_call_start", id: block.id, name: block.name, partial: snapshot() };
            }
            break;
          }

          case "content_block_delta": {
            const delta = event.delta;
            const block = accumulator.block(blockKey(event.index));
            if (delta.type === "text_delta" && block?.type === "text") {
              accumulator.appendTextTo(blockKey(event.index), delta.text);
              yield { type: "text_delta", text: delta.text, partial: snapshot() };
            } else if (delta.type === "thinking_delta" && block?.type === "thinking") {
              accumulator.appendThinkingTo(blockKey(event.index), delta.thinking);
              yield { type: "thinking_delta", thinking: delta.thinking, partial: snapshot() };
            } else if (delta.type === "signature_delta" && block?.type === "thinking") {
              accumulator.setThinkingSignatureFor(blockKey(event.index), (block.signature ?? "") + delta.signature);
            } else if (delta.type === "input_json_delta" && block?.type === "tool_call") {
              accumulator.setToolCallArguments(blockKey(event.index), block.args + delta.partial_json);
              yield { type: "tool_call_delta", id: block.id, arguments: delta.partial_json, partial: snapshot() };
            }
            break;
          }

          case "content_block_stop": {
            const block = accumulator.block(blockKey(event.index));
            if (block?.type === "tool_call") {
              yield { type: "tool_call_end", id: block.id, name: block.name, arguments: block.args, partial: snapshot() };
            }
            break;
          }

          case "message_delta":
            if (event.delta.stop_reason) stopReason = event.delta.stop_reason;
            addUsage(event.usage);
            break;

          case "message_stop":
            break;
        }
      }

      usage.totalTokens = (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);

      yield {
        type: "done",
        response: {
          ...contentBlocksResponse(accumulator.snapshot()),
          stopReason: mapStopReason(stopReason ?? "end_turn"),
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
  return async function* anthropicStream(request, ctx) {
    const fullCtx: ProviderCallContext = ctx && "signal" in ctx && "run" in ctx && "emit" in ctx && "interact" in ctx && "tools" in ctx
      ? ctx as ProviderCallContext
      : createProviderCallContext(ctx);
    yield* streamAnthropicMessages(normalizedConfig, request, fullCtx);
  };
}

/**
 * ProviderStreamFn-compatible stream function for Anthropic Messages API.
 * Resolves config from the Model descriptor and environment.
 */
export const streamAnthropic: ProviderStreamFn = (model, request, ctx) => {
  const config = resolveAnthropicConfig({
    baseUrl: model.baseUrl,
    model: model.id,
    apiKey: model.apiKey,
    thinkingLevel: model.thinkingLevel,
    timeoutMs: model.timeoutMs,
    maxRetries: model.maxRetries,
    retryDelayMs: model.retryDelayMs,
    headers: model.headers,
  });
  return streamAnthropicMessages(config, request, ctx);
};
