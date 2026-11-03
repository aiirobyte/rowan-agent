import type {
  AssistantMessagePartial,
  LlmContentBlock,
  LlmMessage,
  LlmRequest,
  LlmStopReason,
  LlmStreamEvent,
  LlmTokenUsage,
  LlmToolChoice,
  LlmToolDefinition,
  Model,
  ProviderCallContext,
  ProviderStreamFn,
  StreamFn,
  ThinkingLevel,
  ToolCallBlock,
} from "../protocol";
import { createProviderCallContext, ZERO_COST } from "../protocol";
import { calculateCost } from "../models";
import { ContentBlockAccumulator, contentBlocksResponse } from "../content-blocks";
import { streamProviderRequest } from "./http";
import { googleRequestAuth } from "./request-auth";
import type { OAuthRequestAuth } from "../oauth/credential";
import {
  type BaseProviderConfig,
  asNumber,
  normalizeBaseUrl,
  payloadError,
  resolveBaseProviderConfig,
} from "./shared";

const DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export type GeminiCompatibleConfig = BaseProviderConfig;
export type ResolveGeminiCompatibleConfigInput = Partial<GeminiCompatibleConfig>;

export function resolveGeminiCompatibleConfig(
  input: ResolveGeminiCompatibleConfigInput = {},
): GeminiCompatibleConfig {
  return resolveBaseProviderConfig(input, DEFAULT_GEMINI_BASE_URL);
}

type GeminiPart = {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { id?: string; name?: string; args?: unknown };
  functionResponse?: {
    id?: string;
    name: string;
    response: unknown;
    parts?: GeminiPart[];
  };
};

type GeminiContent = {
  role: "user" | "model";
  parts: GeminiPart[];
};

type GeminiUsage = {
  promptTokenCount?: number;
  cachedContentTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
};

type GeminiChunk = {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }>;
  usageMetadata?: GeminiUsage;
  error?: unknown;
};

function replayedSignature(signature: string | undefined): string | undefined {
  if (!signature) return undefined;
  if (signature.startsWith("openai-reasoning:") || signature.startsWith("anthropic-redacted:")) {
    return undefined;
  }
  return signature;
}

function toolNames(messages: readonly LlmMessage[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const message of messages) {
    if (message.role !== "assistant" || typeof message.content === "string") continue;
    for (const part of message.content) {
      if (part.type === "tool_use") names.set(part.id, part.name);
    }
  }
  return names;
}

function toolResultParts(part: Extract<LlmContentBlock, { type: "tool_result" }>): {
  text: string;
  images: GeminiPart[];
} {
  if (typeof part.content === "string") return { text: part.content, images: [] };
  const texts: string[] = [];
  const images: GeminiPart[] = [];
  for (const block of part.content) {
    if (block.type === "text") texts.push(block.text);
    else if (block.type === "image") {
      images.push({ inlineData: { mimeType: block.mimeType, data: block.data } });
    }
  }
  return { text: texts.join("\n"), images };
}

function geminiMajorVersion(modelId: string): number | undefined {
  const match = modelId.toLowerCase().match(/^gemini(?:-live)?-(\d+)/);
  return match ? Number.parseInt(match[1]!, 10) : undefined;
}

function appendToolResponse(content: GeminiContent[], part: GeminiPart): void {
  const last = content.at(-1);
  if (last?.role === "user" && last.parts.some((item) => item.functionResponse)) {
    last.parts.push(part);
  } else {
    content.push({ role: "user", parts: [part] });
  }
}

function convertMessages(modelId: string, messages: readonly LlmMessage[]): GeminiContent[] {
  const names = toolNames(messages);
  const contents: GeminiContent[] = [];
  const supportsNestedImages = (geminiMajorVersion(modelId) ?? 0) >= 3;

  for (const message of messages) {
    if (message.role === "user") {
      if (typeof message.content === "string") {
        contents.push({ role: "user", parts: [{ text: message.content }] });
        continue;
      }
      const parts: GeminiPart[] = [];
      for (const part of message.content) {
        if (part.type === "text") parts.push({ text: part.text });
        else if (part.type === "image") {
          parts.push({ inlineData: { mimeType: part.mimeType, data: part.data } });
        }
      }
      if (parts.length > 0) contents.push({ role: "user", parts });
      continue;
    }

    if (message.role === "assistant") {
      if (typeof message.content === "string") {
        contents.push({ role: "model", parts: [{ text: message.content }] });
        continue;
      }
      const parts: GeminiPart[] = [];
      for (const part of message.content) {
        if (part.type === "text") {
          if (part.text.trim()) parts.push({ text: part.text });
        } else if (part.type === "thinking") {
          const signature = replayedSignature(part.signature);
          if (!part.thinking.trim() && !signature) continue;
          parts.push({
            text: part.thinking,
            thought: true,
            ...(signature ? { thoughtSignature: signature } : {}),
          });
        } else if (part.type === "tool_use") {
          const signature = replayedSignature(part.signature);
          parts.push({
            functionCall: {
              name: part.name,
              args: part.input ?? {},
              ...(part.id ? { id: part.id } : {}),
            },
            ...(signature ? { thoughtSignature: signature } : {}),
          });
        }
      }
      if (parts.length > 0) contents.push({ role: "model", parts });
      continue;
    }

    const toolResults = typeof message.content === "string"
      ? [{
        toolUseId: "",
        isError: false,
        content: message.content,
      }]
      : message.content.filter((part) => part.type === "tool_result");
    for (const result of toolResults) {
      const converted = toolResultParts(result as Extract<LlmContentBlock, { type: "tool_result" }>);
      const response = result.isError ? { error: converted.text } : { output: converted.text };
      appendToolResponse(contents, {
        functionResponse: {
          name: names.get(result.toolUseId) ?? "tool",
          response,
          ...(result.toolUseId ? { id: result.toolUseId } : {}),
          ...(converted.images.length > 0 && supportsNestedImages ? { parts: converted.images } : {}),
        },
      });
      if (converted.images.length > 0 && !supportsNestedImages) {
        contents.push({ role: "user", parts: [{ text: "Tool result image:" }, ...converted.images] });
      }
    }
  }
  return contents;
}

function convertTools(tools: readonly LlmToolDefinition[]): unknown[] {
  return [{
    functionDeclarations: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parametersJsonSchema: tool.parameters,
    })),
  }];
}

function convertToolChoice(choice: LlmToolChoice): Record<string, unknown> {
  if (choice === "auto") return { mode: "AUTO" };
  if (choice === "none") return { mode: "NONE" };
  if (choice === "required") return { mode: "ANY" };
  return { mode: "ANY", allowedFunctionNames: [choice.name] };
}

function usesThinkingLevel(modelId: string): boolean {
  const id = modelId.toLowerCase();
  return /gemini-3(?:\.\d+)?-(?:pro|flash)/.test(id)
    || /gemini-(?:[4-9]|[1-9]\d)/.test(id)
    || id === "gemini-flash-latest"
    || id === "gemini-flash-lite-latest"
    || /gemma-?4/.test(id);
}

function thinkingLevel(level: ThinkingLevel): "MINIMAL" | "LOW" | "MEDIUM" | "HIGH" {
  switch (level) {
    case "minimal": return "MINIMAL";
    case "low": return "LOW";
    case "medium": return "MEDIUM";
    case "high":
    case "xhigh":
    case "max": return "HIGH";
    case "off": return "MINIMAL";
  }
}

function thinkingBudget(modelId: string, level: Exclude<ThinkingLevel, "off">): number {
  const id = modelId.toLowerCase();
  if (id.includes("2.5-pro")) {
    return { minimal: 128, low: 2_048, medium: 8_192, high: 32_768, xhigh: 32_768, max: 32_768 }[level];
  }
  if (id.includes("2.5-flash-lite")) {
    return { minimal: 512, low: 2_048, medium: 8_192, high: 24_576, xhigh: 24_576, max: 24_576 }[level];
  }
  if (id.includes("2.5-flash")) {
    return { minimal: 128, low: 2_048, medium: 8_192, high: 24_576, xhigh: 24_576, max: 24_576 }[level];
  }
  return -1;
}

function convertThinking(
  config: GeminiCompatibleConfig,
  request: LlmRequest,
): Record<string, unknown> | undefined {
  const level = request.thinkingLevel ?? config.thinkingLevel;
  if (level === undefined) return undefined;
  if (level === "off") return { thinkingBudget: 0 };
  if (usesThinkingLevel(config.model)) {
    return { includeThoughts: true, thinkingLevel: thinkingLevel(level) };
  }
  return { includeThoughts: true, thinkingBudget: thinkingBudget(config.model, level) };
}

function buildRequestBody(
  config: GeminiCompatibleConfig,
  request: LlmRequest,
): Record<string, unknown> {
  const generationConfig: Record<string, unknown> = {};
  const temperature = request.temperature ?? config.temperature;
  const maxTokens = request.maxTokens ?? config.maxTokens;
  if (temperature !== undefined) generationConfig.temperature = temperature;
  if (maxTokens !== undefined) generationConfig.maxOutputTokens = maxTokens;
  const thinking = convertThinking(config, request);
  if (thinking) generationConfig.thinkingConfig = thinking;

  return {
    contents: convertMessages(config.model, request.messages),
    ...(request.system ? { systemInstruction: { parts: [{ text: request.system }] } } : {}),
    ...(request.tools && request.tools.length > 0
      ? {
        tools: convertTools(request.tools),
        ...(request.toolChoice
          ? { toolConfig: { functionCallingConfig: convertToolChoice(request.toolChoice) } }
          : {}),
      }
      : {}),
    ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {}),
  };
}

function normalizeGeminiUsage(usage: GeminiUsage | undefined): LlmTokenUsage | undefined {
  if (!usage) return undefined;
  const prompt = asNumber(usage.promptTokenCount);
  const cached = asNumber(usage.cachedContentTokenCount) ?? 0;
  const candidates = asNumber(usage.candidatesTokenCount);
  const thoughts = asNumber(usage.thoughtsTokenCount);
  const inputTokens = prompt !== undefined ? Math.max(0, prompt - cached) : undefined;
  const outputTokens = candidates !== undefined || thoughts !== undefined
    ? (candidates ?? 0) + (thoughts ?? 0)
    : undefined;
  const totalTokens = asNumber(usage.totalTokenCount)
    ?? (inputTokens !== undefined || outputTokens !== undefined || cached > 0
      ? (inputTokens ?? 0) + (outputTokens ?? 0) + cached
      : undefined);
  if (
    inputTokens === undefined
    && outputTokens === undefined
    && totalTokens === undefined
    && cached === 0
    && thoughts === undefined
  ) {
    return undefined;
  }
  return {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
    ...(cached ? { cacheReadTokens: cached } : {}),
    ...(thoughts !== undefined ? { reasoningTokens: thoughts } : {}),
  };
}

function mapStopReason(reason: string | undefined, hasToolCalls: boolean): LlmStopReason {
  switch (reason) {
    case "STOP": return hasToolCalls ? "tool_use" : "end_turn";
    case "MAX_TOKENS": return "max_tokens";
    case undefined: return hasToolCalls ? "tool_use" : "end_turn";
    case "SAFETY":
    case "RECITATION":
    case "BLOCKLIST":
    case "PROHIBITED_CONTENT":
    case "SPII":
    case "IMAGE_SAFETY":
    case "IMAGE_PROHIBITED_CONTENT":
    case "IMAGE_RECITATION":
    case "IMAGE_OTHER":
    case "LANGUAGE":
    case "MALFORMED_FUNCTION_CALL":
    case "UNEXPECTED_TOOL_CALL":
    case "TOO_MANY_TOOL_CALLS":
    case "NO_IMAGE":
      return "error";
    default: return "unknown";
  }
}

async function* streamGemini(
  config: GeminiCompatibleConfig,
  request: LlmRequest,
  ctx?: ProviderCallContext,
  model?: Model,
): AsyncGenerator<LlmStreamEvent> {
  const body = buildRequestBody(config, request);
  const providerId = config.providerId ?? model?.provider ?? "unknown";
  const endpoint = `${normalizeBaseUrl(config.baseUrl)}/models/${encodeURIComponent(config.model)}:streamGenerateContent?alt=sse`;
  let requestAuth: OAuthRequestAuth | undefined;
  const concreteModel: Model = model ?? {
    id: config.model,
    provider: providerId,
    protocol: "gemini-compatible",
    baseUrl: config.baseUrl,
    reasoning: false,
    input: ["text", "image"],
    cost: config.cost ?? ZERO_COST,
    contextWindow: 128_000,
    maxTokens: 4096,
  };

  yield* streamProviderRequest({
    config,
    endpoint,
    llmRequest: request,
    requestName: "Gemini request",
    signal: ctx?.signal,
    prepare: async () => {
      requestAuth = googleRequestAuth(config, providerId);
    },
    request: () => ({
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(requestAuth?.headers ?? {}),
      },
      body: JSON.stringify(body),
    }),
  }, async function* (response) {
    const accumulator = new ContentBlockAccumulator();
    const partial: AssistantMessagePartial = { role: "assistant", contentBlocks: [] };
    const toolIds = new Set<string>();
    let blockSerial = 0;
    let currentText: { key: string; thinking: boolean } | undefined;
    let finishReason: string | undefined;
    let usage: LlmTokenUsage | undefined;

    const snapshot = (): AssistantMessagePartial => {
      partial.contentBlocks = accumulator.snapshot();
      return { ...partial, contentBlocks: [...partial.contentBlocks] };
    };
    const nextKey = (kind: string): string => `${kind}:${blockSerial++}`;
    const uniqueToolId = (provided: string | undefined, name: string): string => {
      if (provided && !toolIds.has(provided)) return provided;
      let serial = toolIds.size + 1;
      let id = `${name || "tool"}_${serial}`;
      while (toolIds.has(id)) id = `${name || "tool"}_${++serial}`;
      return id;
    };

    async function* handleChunk(chunk: GeminiChunk): AsyncGenerator<LlmStreamEvent> {
      const chunkError = payloadError(chunk);
      if (chunkError) throw chunkError;
      if (chunk.usageMetadata) usage = normalizeGeminiUsage(chunk.usageMetadata);
      const candidate = chunk.candidates?.[0];
      if (!candidate) return;
      if (candidate.finishReason) finishReason = candidate.finishReason;

      for (const part of candidate.content?.parts ?? []) {
        const signature = replayedSignature(part.thoughtSignature);
        if (part.text !== undefined) {
          const thinking = part.thought === true;
          if (part.text.length > 0 || thinking || signature) {
            if (!currentText || currentText.thinking !== thinking) {
              const key = nextKey(thinking ? "thinking" : "text");
              if (thinking) accumulator.startThinking(key);
              else accumulator.startText(key);
              currentText = { key, thinking };
            }
            if (part.text.length > 0) {
              if (thinking) accumulator.appendThinkingTo(currentText.key, part.text);
              else accumulator.appendTextTo(currentText.key, part.text);
              yield {
                type: thinking ? "thinking_delta" : "text_delta",
                ...(thinking ? { thinking: part.text } : { text: part.text }),
                partial: snapshot(),
              } as LlmStreamEvent;
            }
            if (thinking && signature) {
              accumulator.setThinkingSignatureFor(currentText.key, signature);
            }
          }
        }

        if (part.functionCall) {
          currentText = undefined;
          const name = part.functionCall.name ?? "";
          const id = uniqueToolId(part.functionCall.id, name);
          toolIds.add(id);
          const key = nextKey("tool");
          const block: ToolCallBlock = { type: "tool_call", id, name, args: "" };
          accumulator.startToolCall(key, block);
          yield { type: "tool_call_start", id, name, partial: snapshot() };
          const args = JSON.stringify(part.functionCall.args ?? {});
          accumulator.setToolCallArguments(key, args);
          if (signature) accumulator.setToolCallSignatureFor(key, signature);
          if (args) {
            yield { type: "tool_call_delta", id, arguments: args, partial: snapshot() };
          }
          yield { type: "tool_call_end", id, name, arguments: args, partial: snapshot() };
        }
      }
    }

    yield { type: "start", partial: snapshot() };

    if (response.isEventStream) {
      for await (const sse of response.sse()) {
        let chunk: GeminiChunk;
        try {
          chunk = JSON.parse(sse.data) as GeminiChunk;
        } catch {
          continue;
        }
        yield* handleChunk(chunk);
      }
    } else {
      const chunk = await response.json<GeminiChunk>();
      yield* handleChunk(chunk);
    }

    if (usage) usage.cost = calculateCost(concreteModel, usage);
    const projected = contentBlocksResponse(accumulator.snapshot());
    yield {
      type: "done",
      response: {
        ...projected,
        stopReason: mapStopReason(finishReason, (projected.toolCalls?.length ?? 0) > 0),
        ...(usage ? { usage } : {}),
      },
    };
  });
}

export function createGeminiCompatibleStream(config: GeminiCompatibleConfig): StreamFn {
  const normalizedConfig = { ...config, baseUrl: normalizeBaseUrl(config.baseUrl) };
  return async function* geminiCompatibleStream(request, ctx) {
    const fullCtx: ProviderCallContext = ctx && "signal" in ctx && "run" in ctx && "interact" in ctx && "tools" in ctx
      ? ctx as ProviderCallContext
      : createProviderCallContext(ctx);
    yield* streamGemini(normalizedConfig, request, fullCtx);
  };
}

export const streamGeminiCompatible: ProviderStreamFn = (model, request, ctx) => {
  const config = resolveGeminiCompatibleConfig({
    baseUrl: model.baseUrl,
    model: model.id,
    apiKey: model.apiKey,
    auth: model.auth,
    providerId: model.provider,
    thinkingLevel: model.thinkingLevel,
    timeoutMs: model.timeoutMs,
    maxRetries: model.maxRetries,
    retryDelayMs: model.retryDelayMs,
    headers: model.headers,
    cost: model.cost,
  });
  return streamGemini(config, request, ctx, model);
};
