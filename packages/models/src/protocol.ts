// ---------------------------------------------------------------------------
// API protocol identifiers
// ---------------------------------------------------------------------------

export type KnownApi =
  | "openai-completions"
  | "openai-responses"
  | "anthropic-messages";

export type Api = KnownApi | (string & {});

// ---------------------------------------------------------------------------
// Provider identifiers
// ---------------------------------------------------------------------------

export type KnownProvider =
  | "openai"
  | "anthropic"
  | "deepseek"
  | "openrouter"
  | "groq"
  | "together"
  | "fireworks"
  | "xai"
  | "cerebras";

export type Provider = KnownProvider | string;

// ---------------------------------------------------------------------------
// Model descriptor
// ---------------------------------------------------------------------------

export interface ModelCost {
  input: number;   // $/million tokens
  output: number;  // $/million tokens
  cacheRead: number;
  cacheWrite: number;
}

export interface Model {
  id: string;
  name: string;
  api: Api;
  provider: Provider;
  baseUrl: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  cost: ModelCost;
  contextWindow: number;
  maxTokens: number;
  headers?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Provider configuration (used by extension registerProvider)
// ---------------------------------------------------------------------------

export type ProviderModelConfig = {
  id: string;
  name: string;
  api: Api;
  reasoning: boolean;
  input: ("text" | "image")[];
  cost: ModelCost;
  contextWindow: number;
  maxTokens: number;
};

export type ProviderConfig = {
  name: string;
  baseUrl: string;
  apiKey?: string;
  api: Api;
  streamSimple?: ApiStreamFn;
  headers?: Record<string, string>;
  authHeader?: string;
  models: ProviderModelConfig[];
  oauth?: {
    clientId: string;
    scopes?: string[];
    tokenEndpoint?: string;
  };
};

// ---------------------------------------------------------------------------
// Backward-compatible model reference
// ---------------------------------------------------------------------------

export type LlmModelRef = {
  provider: string;
  name: string;
};

// ---------------------------------------------------------------------------
// Token usage
// ---------------------------------------------------------------------------

export type LlmTokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
};

export type LlmModelUsage = LlmTokenUsage & {
  inputMessages: number;
};

// ---------------------------------------------------------------------------
// Content types
// ---------------------------------------------------------------------------

export type LlmTextContent = {
  type: "text";
  text: string;
};

export type LlmImageContent = {
  type: "image";
  data: string;
  mimeType: string;
};

export type LlmThinkingContent = {
  type: "thinking";
  thinking: string;
  signature?: string;
};

export type LlmToolUseContent = {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
};

export type LlmToolResultContent = {
  type: "tool_result";
  toolUseId: string;
  content: string;
  isError?: boolean;
};

export type LlmContentPart = LlmTextContent | LlmImageContent | LlmThinkingContent | LlmToolUseContent | LlmToolResultContent;

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export type LlmMessage = {
  role: "user" | "assistant" | "tool";
  content: string | LlmContentPart[];
};

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export type LlmToolDefinition = {
  name: string;
  description: string;
  parameters: unknown;
};

export type LlmToolCall = {
  id: string;
  name: string;
  arguments: unknown;
};

// ---------------------------------------------------------------------------
// Request / Response
// ---------------------------------------------------------------------------

export type LlmRequest = {
  model: LlmModelRef;
  system?: string;
  messages: LlmMessage[];
  tools?: LlmToolDefinition[];
  maxTokens?: number;
  temperature?: number;
};

export type LlmStopReason = "end_turn" | "tool_use" | "max_tokens" | "stop" | "error" | "unknown";

export type LlmResponse = {
  content: string;
  thinking?: string;
  toolCalls?: LlmToolCall[];
  stopReason?: LlmStopReason;
  usage?: LlmTokenUsage;
};

// ---------------------------------------------------------------------------
// Content blocks (for streaming partial accumulation)
// ---------------------------------------------------------------------------

export type TextBlock = {
  type: "text";
  text: string;
};

export type ThinkingBlock = {
  type: "thinking";
  thinking: string;
};

export type ToolCallBlock = {
  type: "tool_call";
  id: string;
  name: string;
  args: string;  // Raw JSON string (may be incomplete during streaming)
};

export type ContentBlock = TextBlock | ThinkingBlock | ToolCallBlock;

/**
 * Accumulated assistant message partial, carried by each streaming event.
 * The provider builds this incrementally; the consumer reads it directly.
 */
export type AssistantMessagePartial = {
  role: "assistant";
  contentBlocks: ContentBlock[];
  stopReason?: LlmStopReason;
};

// ---------------------------------------------------------------------------
// Stream events
// ---------------------------------------------------------------------------

export type LlmStreamEvent =
  | { type: "text_delta"; text: string; partial: AssistantMessagePartial }
  | { type: "thinking_delta"; thinking: string; partial: AssistantMessagePartial }
  | { type: "tool_call_start"; id: string; name: string; partial: AssistantMessagePartial }
  | { type: "tool_call_delta"; id: string; arguments: string; partial: AssistantMessagePartial }
  | { type: "tool_call_end"; id: string; name: string; arguments: string; partial: AssistantMessagePartial }
  | { type: "model_requested"; model: LlmModelRef; usage: LlmModelUsage }
  | { type: "error"; error: Error }
  | { type: "done"; response?: LlmResponse };

// ---------------------------------------------------------------------------
// Partial helpers
// ---------------------------------------------------------------------------

export function textFromPartial(partial: AssistantMessagePartial): string {
  return partial.contentBlocks
    .filter((b): b is TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export function toolCallsFromPartial(partial: AssistantMessagePartial): ToolCallBlock[] {
  return partial.contentBlocks.filter((b): b is ToolCallBlock => b.type === "tool_call");
}

// ---------------------------------------------------------------------------
// Stream options
// ---------------------------------------------------------------------------

export type LlmStreamOptions = {
  signal?: AbortSignal;
};

// ---------------------------------------------------------------------------
// Stream function types
// ---------------------------------------------------------------------------

/**
 * Low-level stream function: receives a full LlmRequest and yields events.
 * This is the function the agent loop consumes.
 */
export type StreamFn = (
  request: LlmRequest,
  options: LlmStreamOptions,
) => AsyncIterable<LlmStreamEvent>;

/**
 * API-level stream function: receives a resolved Model and yields events.
 * Providers implement this signature. The registry dispatches by model.api.
 */
export type ApiStreamFn = (
  model: Model,
  request: LlmRequest,
  options: LlmStreamOptions,
) => AsyncIterable<LlmStreamEvent>;
