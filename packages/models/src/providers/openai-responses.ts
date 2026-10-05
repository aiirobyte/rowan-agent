import type {
  LlmMessage,
  LlmRequest,
  LlmStreamEvent,
  LlmTokenUsage,
  LlmStopReason,
  LlmToolChoice,
  LlmToolDefinition,
  ProviderCallContext,
  ProviderStreamFn,
  StreamFn,
  AssistantMessagePartial,
  ThinkingLevel,
  ToolCallBlock,
} from "../protocol";
import { createProviderCallContext } from "../protocol";
import { ContentBlockAccumulator, contentBlocksResponse } from "../content-blocks";
import { streamProviderRequest } from "./http";
import {
  payloadError,
  type BaseProviderConfig,
  normalizeBaseUrl,
  normalizeUsage,
  openAIReasoningEffort,
  type RawUsage,
  resolveBaseProviderConfig,
  sanitizeToolInput,
} from "./shared";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export type OpenAIResponsesConfig = BaseProviderConfig & {
  reasoningEffort?: Exclude<ThinkingLevel, "off">;
};

export type ResolveOpenAIResponsesConfigInput = Partial<OpenAIResponsesConfig>;

export function resolveOpenAIResponsesConfig(
  input: ResolveOpenAIResponsesConfigInput = {},
): OpenAIResponsesConfig {
  return {
    ...resolveBaseProviderConfig(input, "https://api.openai.com/v1"),
    ...(input.reasoningEffort !== undefined ? { reasoningEffort: input.reasoningEffort } : {}),
  };
}

// ---------------------------------------------------------------------------
// Message / tool conversion for Responses API
// ---------------------------------------------------------------------------

type ResponsesInputMessage =
  | { role: "user"; content: string | ResponsesInputContent[] }
  | { role: "assistant"; content: string }
  | { type: "function_call"; call_id: string; name: string; arguments: string }
  | ReasoningItem
  | { type: "function_call_output"; call_id: string; output: string };

/** A reasoning item as the API returns it; replayed verbatim when `store` is false. */
type ReasoningItem = {
  type: "reasoning";
  id: string;
  encrypted_content?: string;
  summary: Array<{ type: "summary_text"; text: string }>;
};

/** Reasoning items travel in the portable thinking signature with this prefix. */
const REASONING_PREFIX = "openai-reasoning:";

function reasoningItems(signature: string | undefined): ReasoningItem[] {
  if (!signature?.startsWith(REASONING_PREFIX)) return [];
  try {
    const items = JSON.parse(signature.slice(REASONING_PREFIX.length)) as unknown;
    return Array.isArray(items) ? items as ReasoningItem[] : [];
  } catch {
    return [];
  }
}

type ResponsesInputContent =
  | { type: "input_text"; text: string }
  | { type: "input_image"; detail: "auto"; image_url: string };

function convertMessages(messages: LlmMessage[]): ResponsesInputMessage[] {
  const result: ResponsesInputMessage[] = [];
  for (const msg of messages) {
    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        result.push({ role: "user", content: msg.content });
      } else {
        const content: ResponsesInputContent[] = msg.content.flatMap((part): ResponsesInputContent[] => {
          if (part.type === "text") {
            return [{ type: "input_text", text: part.text }];
          }
          if (part.type === "image") {
            return [{
              type: "input_image",
              detail: "auto",
              image_url: `data:${part.mimeType};base64,${part.data}`,
            }];
          }
          return [];
        });
        if (content.length > 0) result.push({ role: "user", content });
      }
    } else if (msg.role === "assistant") {
      if (typeof msg.content === "string") {
        result.push({ role: "assistant", content: msg.content });
      } else {
        // Replay reasoning first, as the API emitted it ahead of the output.
        for (const part of msg.content) {
          if (part.type === "thinking") result.push(...reasoningItems(part.signature));
        }
        const text = msg.content
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join("\n");
        if (text) result.push({ role: "assistant", content: text });

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
              output: typeof part.content === "string" ? part.content : JSON.stringify(part.content),
            });
          }
        }
      }
    }
  }
  return result;
}

function convertToolChoice(choice: LlmToolChoice): unknown {
  return typeof choice === "string" ? choice : { type: "function", name: choice.name };
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
    // Stateless: reasoning comes back encrypted and is replayed with the history.
    store: false,
  };

  if (request.system) {
    body.instructions = request.system;
  }

  if (request.maxTokens ?? config.maxTokens) {
    body.max_output_tokens = request.maxTokens ?? config.maxTokens;
  }

  if (request.tools && request.tools.length > 0) {
    body.tools = convertTools(request.tools);
    if (request.toolChoice) body.tool_choice = convertToolChoice(request.toolChoice);
  }

  const requestedThinkingLevel = request.thinkingLevel ?? config.thinkingLevel;
  const reasoningEffort = requestedThinkingLevel === "off"
    ? undefined
    : requestedThinkingLevel ?? config.reasoningEffort;
  if (reasoningEffort) {
    body.reasoning = { effort: openAIReasoningEffort(reasoningEffort), summary: "auto" };
    body.include = ["reasoning.encrypted_content"];
  }

  return body;
}

// ---------------------------------------------------------------------------
// Stop reason mapping
// ---------------------------------------------------------------------------

function mapStopReason(reason: string | null | undefined, hasToolCalls: boolean): LlmStopReason {
  switch (reason) {
    case "completed": return hasToolCalls ? "tool_use" : "end_turn";
    case "max_output_tokens":
    case "max_tokens":
    case "incomplete": return "max_tokens";
    case "content_filter": return "error";
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
  | { type: "response.reasoning_summary_part.added"; item_id: string; output_index: number; summary_index: number; part: { type: "summary_text"; text: string } }
  | { type: "response.reasoning_summary_part.done"; item_id: string; output_index: number; summary_index: number; part: { type: "summary_text"; text: string } }
  | { type: "response.reasoning_summary_text.delta"; item_id: string; output_index: number; summary_index: number; delta: string }
  | { type: "response.reasoning_summary_text.done"; item_id: string; output_index: number; summary_index: number; text: string }
  | { type: "response.reasoning_text.delta"; item_id: string; output_index: number; content_index: number; delta: string }
  | { type: "response.reasoning_text.done"; item_id: string; output_index: number; content_index: number; text: string }
  | { type: "response.output_text.delta"; output_index: number; content_index: number; delta: string }
  | { type: "response.output_text.done"; output_index: number; content_index: number; text: string }
  | { type: "response.function_call_arguments.delta"; output_index: number; item_id: string; call_id?: string; delta: string }
  | { type: "response.function_call_arguments.done"; output_index: number; item_id: string; call_id?: string; name?: string; arguments: string }
  | { type: "response.output_item.done"; output_index: number; item: { type: string; id?: string; call_id?: string; name?: string; arguments?: string; encrypted_content?: string; summary?: Array<{ type: string; text?: string }>; content?: Array<{ type: string; text?: string }> } }
  | { type: "response.completed"; response: { usage?: RawUsage } }
  | { type: "response.incomplete"; response: { usage?: RawUsage; incomplete_details?: { reason: string } } }
  | { type: "error"; error: { message: string; type?: string } };

// ---------------------------------------------------------------------------
// Streaming
// ---------------------------------------------------------------------------

async function* streamResponses(
  config: OpenAIResponsesConfig,
  request: LlmRequest,
  ctx?: ProviderCallContext,
): AsyncGenerator<LlmStreamEvent> {
  const body = buildRequestBody(config, request);
  const endpoint = `${normalizeBaseUrl(config.baseUrl)}/responses`;

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
      // Reasoning parts by `<outputIndex>:<kind>:<index>`, so a done event can
      // report only the text its deltas have not already streamed.
      const reasoningParts = new Map<string, string>();
      const reasoningKeys = new Map<number, string>();
      const reasoning = new Map<number, ReasoningItem>();
      let stopReason: string | null = null;
      let usage: LlmTokenUsage | undefined;
      // Map output_index -> tool call state
      const accumulator = new ContentBlockAccumulator();
      const toolBlock = (outputIndex: number): ToolCallBlock | undefined => {
        const block = accumulator.block(`tool:${outputIndex}`);
        return block?.type === "tool_call" ? block : undefined;
      };

      const partial: AssistantMessagePartial = {
        role: "assistant",
        contentBlocks: [],
      };

      function rebuildPartial(): void {
        for (const [outputIndex, item] of reasoning) {
          const key = reasoningKeys.get(outputIndex);
          if (key) accumulator.setThinkingSignatureFor(key, REASONING_PREFIX + JSON.stringify([item]));
        }
        partial.contentBlocks = accumulator.snapshot();
      }

      function updateReasoningPart(key: string, text: string, append: boolean): string {
        const previous = reasoningParts.get(key) ?? "";
        const next = append ? previous + text : text;
        reasoningParts.set(key, next);
        const [outputIndexText] = key.split(":");
        const outputIndex = Number(outputIndexText);
        let blockKey = reasoningKeys.get(outputIndex);
        if (!blockKey) {
          blockKey = `reasoning:${outputIndex}`;
          reasoningKeys.set(outputIndex, blockKey);
          accumulator.startThinking(blockKey);
        }
        const prefix = `${outputIndex}:`;
        accumulator.setThinking(
          blockKey,
          [...reasoningParts].filter(([partKey]) => partKey.startsWith(prefix)).map(([, value]) => value).join(""),
        );
        return append ? text : next.startsWith(previous) ? next.slice(previous.length) : next;
      }

      function reasoningPartKey(outputIndex: number, kind: "summary" | "text", index: number): string {
        return `${outputIndex}:${kind}:${index}`;
      }

      yield { type: "start", partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };

      for await (const sse of response.sse()) {
        let event: ResponsesStreamEvent;
        try { event = JSON.parse(sse.data) as ResponsesStreamEvent; } catch { continue; }
        const streamError = payloadError(event);
        if (streamError) throw streamError;

        switch (event.type) {
          case "response.reasoning_summary_part.added": {
            const delta = updateReasoningPart(
              reasoningPartKey(event.output_index, "summary", event.summary_index),
              event.part.text,
              false,
            );
            rebuildPartial();
            if (delta) {
              yield { type: "thinking_delta", thinking: delta, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
            }
            break;
          }

          case "response.reasoning_summary_part.done": {
            const delta = updateReasoningPart(
              reasoningPartKey(event.output_index, "summary", event.summary_index),
              event.part.text,
              false,
            );
            rebuildPartial();
            if (delta) {
              yield { type: "thinking_delta", thinking: delta, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
            }
            break;
          }

          case "response.reasoning_summary_text.delta":
            updateReasoningPart(
              reasoningPartKey(event.output_index, "summary", event.summary_index),
              event.delta,
              true,
            );
            rebuildPartial();
            yield { type: "thinking_delta", thinking: event.delta, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
            break;

          case "response.reasoning_summary_text.done": {
            const delta = updateReasoningPart(
              reasoningPartKey(event.output_index, "summary", event.summary_index),
              event.text,
              false,
            );
            rebuildPartial();
            if (delta) {
              yield { type: "thinking_delta", thinking: delta, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
            }
            break;
          }

          case "response.reasoning_text.delta":
            updateReasoningPart(
              reasoningPartKey(event.output_index, "text", event.content_index),
              event.delta,
              true,
            );
            rebuildPartial();
            yield { type: "thinking_delta", thinking: event.delta, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
            break;

          case "response.reasoning_text.done": {
            const delta = updateReasoningPart(
              reasoningPartKey(event.output_index, "text", event.content_index),
              event.text,
              false,
            );
            rebuildPartial();
            if (delta) {
              yield { type: "thinking_delta", thinking: delta, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
            }
            break;
          }

          case "response.output_text.delta":
            accumulator.appendText(event.delta);
            rebuildPartial();
            yield { type: "text_delta", text: event.delta, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
            break;

          case "response.output_item.added":
            if (event.item.type === "function_call") {
              const tc = { type: "tool_call" as const, id: event.item.call_id ?? event.item.id ?? "", name: event.item.name ?? "", args: "" };
              accumulator.startToolCall(`tool:${event.output_index}`, tc);
              rebuildPartial();
              yield { type: "tool_call_start", id: tc.id, name: tc.name, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
            }
            break;

          case "response.function_call_arguments.delta": {
            const block = toolBlock(event.output_index);
            if (block) {
              accumulator.updateToolCall(`tool:${event.output_index}`, {
                ...(event.call_id ? { id: event.call_id } : {}),
                args: block.args + event.delta,
              });
              rebuildPartial();
              yield { type: "tool_call_delta", id: toolBlock(event.output_index)!.id, arguments: event.delta, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
            }
            break;
          }

          case "response.function_call_arguments.done": {
            if (toolBlock(event.output_index)) {
              accumulator.updateToolCall(`tool:${event.output_index}`, {
                ...(event.call_id ? { id: event.call_id } : {}),
                ...(event.name ? { name: event.name } : {}),
                args: event.arguments,
              });
            }
            break;
          }
          case "response.output_item.done": {
            if (event.item.type === "reasoning") {
              if (event.item.id) {
                const item: ReasoningItem = {
                  type: "reasoning",
                  id: event.item.id,
                  ...(event.item.encrypted_content ? { encrypted_content: event.item.encrypted_content } : {}),
                  summary: (event.item.summary ?? []).flatMap((part) =>
                    part.type === "summary_text" && part.text ? [{ type: "summary_text" as const, text: part.text }] : []),
                };
                reasoning.set(event.output_index, item);
                rebuildPartial();
              }
              for (const [index, part] of (event.item.summary ?? []).entries()) {
                if (part.type !== "summary_text" || !part.text) continue;
                const delta = updateReasoningPart(
                  reasoningPartKey(event.output_index, "summary", index),
                  part.text,
                  false,
                );
                rebuildPartial();
                if (delta) {
                  yield { type: "thinking_delta", thinking: delta, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
                }
              }
              for (const [index, part] of (event.item.content ?? []).entries()) {
                if (part.type !== "reasoning_text" || !part.text) continue;
                const delta = updateReasoningPart(
                  reasoningPartKey(event.output_index, "text", index),
                  part.text,
                  false,
                );
                rebuildPartial();
                if (delta) {
                  yield { type: "thinking_delta", thinking: delta, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
                }
              }
            }
            if (event.item.type === "function_call") {
              const block = toolBlock(event.output_index);
              if (block) {
                accumulator.updateToolCall(`tool:${event.output_index}`, {
                  ...(event.item.call_id ? { id: event.item.call_id } : {}),
                  ...(event.item.name ? { name: event.item.name } : {}),
                  ...(event.item.arguments ? { args: event.item.arguments } : {}),
                });
                rebuildPartial();
                const final = toolBlock(event.output_index)!;
                yield { type: "tool_call_end", id: final.id, name: final.name, arguments: final.args, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
              }
            }
            break;
          }

          case "response.completed":
            usage = normalizeUsage(event.response.usage) ?? usage;
            stopReason = "completed";
            break;

          case "response.incomplete":
            usage = normalizeUsage(event.response.usage) ?? usage;
            stopReason = event.response.incomplete_details?.reason ?? "incomplete";
            break;
        }
      }

      const projected = contentBlocksResponse(accumulator.snapshot());

      yield {
        type: "done",
        response: {
          ...projected,
          stopReason: mapStopReason(stopReason, (projected.toolCalls?.length ?? 0) > 0),
          ...(usage ? { usage } : {}),
        },
      };
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createOpenAIResponsesStream(config: OpenAIResponsesConfig): StreamFn {
  const normalizedConfig = { ...config, baseUrl: normalizeBaseUrl(config.baseUrl) };
  return async function* openAIResponsesStream(request, ctx) {
    const fullCtx: ProviderCallContext = ctx && "signal" in ctx && "run" in ctx && "interact" in ctx && "tools" in ctx
      ? ctx as ProviderCallContext
      : createProviderCallContext(ctx);
    yield* streamResponses(normalizedConfig, request, fullCtx);
  };
}

/**
 * ProviderStreamFn-compatible stream function for OpenAI Responses API.
 * Resolves config from the Model descriptor and environment.
 */
export const streamOpenAIResponses: ProviderStreamFn = (model, request, ctx) => {
  const config = resolveOpenAIResponsesConfig({
    baseUrl: model.baseUrl,
    model: model.id,
    apiKey: model.apiKey,
    thinkingLevel: model.thinkingLevel,
    timeoutMs: model.timeoutMs,
    maxRetries: model.maxRetries,
    retryDelayMs: model.retryDelayMs,
    headers: model.headers,
  });
  return streamResponses(config, request, ctx);
};
