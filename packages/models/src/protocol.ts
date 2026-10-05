// ---------------------------------------------------------------------------
// API protocol identifiers
// ---------------------------------------------------------------------------

export type KnownProtocol =
  | "openai-completions"
  | "openai-responses"
  | "anthropic-messages";

export type Protocol = KnownProtocol | (string & {});

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

/** Provider-neutral reasoning level, matching Pi's model/runtime vocabulary. */
export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

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
  name?: string;
  protocol: Protocol;
  provider: Provider;
  baseUrl: string;
  reasoning: boolean;
  /** Default reasoning level; an individual request may override it. */
  thinkingLevel?: ThinkingLevel;
  thinkingLevels?: ThinkingLevel[];
  input: ("text" | "image")[];
  cost: ModelCost;
  contextWindow: number;
  maxTokens: number;
  headers?: Record<string, string>;
  apiKey?: string;
  /** Maximum inactivity from request start or between response body chunks. */
  timeoutMs?: number;
  /** Number of retries after the initial request. */
  maxRetries?: number;
  retryDelayMs?: number;
}

/** Complete connection config for one model, with optional catalog metadata. */
export type ModelConfig = {
  id: string;
  provider: Provider;
  protocol: Protocol;
  baseUrl: string;
  apiKey: string;
  name?: string;
  reasoning?: boolean;
  thinkingLevel?: ThinkingLevel;
  thinkingLevels?: ThinkingLevel[];
  input?: ("text" | "image")[];
  cost?: Partial<ModelCost>;
  contextWindow?: number;
  maxTokens?: number;
  headers?: Record<string, string>;
  /** Maximum inactivity from request start or between response body chunks. */
  timeoutMs?: number;
  /** Number of retries after the initial request. */
  maxRetries?: number;
  retryDelayMs?: number;
};

// ---------------------------------------------------------------------------
// Provider configuration (used by extension provider registration)
// ---------------------------------------------------------------------------

export type ProviderModelConfig = {
  id: string;
  name?: string;
  protocol?: Protocol;
  reasoning?: boolean;
  thinkingLevel?: ThinkingLevel;
  thinkingLevels?: ThinkingLevel[];
  input?: ("text" | "image")[];
  cost?: ModelCost;
  contextWindow?: number;
  maxTokens?: number;
  headers?: Record<string, string>;
};

export type ProviderConfig = {
  id: string;
  displayName?: string;
  icon?: string;
  baseUrl: string;
  apiKey: string;
  protocol: Protocol;
  stream?: ProviderStreamFn;
  headers?: Record<string, string>;
  /** Maximum inactivity while waiting for response headers or the next body chunk. */
  timeoutMs?: number;
  /** Number of retries after the initial request. */
  maxRetries?: number;
  retryDelayMs?: number;
  authHeader?: string;
  models: ProviderModelConfig[];
  oauth?: {
    clientId: string;
    scopes?: string[];
    tokenEndpoint?: string;
  };
};

// ---------------------------------------------------------------------------
// Model reference
// ---------------------------------------------------------------------------

export type ModelRef = {
  provider: string;
  id: string;
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
  content: string | ContentBlock[];
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

export type LlmToolChoice = "auto" | "required" | "none" | { type: "tool"; name: string };

export type LlmRequest = {
  model: ModelRef;
  system?: string;
  messages: LlmMessage[];
  tools?: LlmToolDefinition[];
  toolChoice?: LlmToolChoice;
  /** Per-request reasoning level; falls back to the selected model's default. */
  thinkingLevel?: ThinkingLevel;
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

export type ImageBlock = {
  type: "image";
  data: string;
  mimeType: string;
};

export type AudioBlock = {
  type: "audio";
  data: string;
  mimeType: string;
};

export type ResourceLinkBlock = {
  type: "resource_link";
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
};

export type ResourceBlock = {
  type: "resource";
  resource: {
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
  };
};

export type ThinkingBlock = {
  type: "thinking";
  thinking: string;
  /** Opaque provider token that lets the same provider verify a replayed block. */
  signature?: string;
};

export type ToolCallBlock = {
  type: "tool_call";
  id: string;
  name: string;
  args: string;  // Raw JSON string (may be incomplete during streaming)
};

export type ContentBlock =
  | TextBlock
  | ImageBlock
  | AudioBlock
  | ResourceLinkBlock
  | ResourceBlock
  | ThinkingBlock
  | ToolCallBlock;

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
  | { type: "start"; partial: AssistantMessagePartial }
  | { type: "text_delta"; text: string; partial: AssistantMessagePartial }
  | { type: "thinking_delta"; thinking: string; partial: AssistantMessagePartial }
  | { type: "tool_call_start"; id: string; name: string; partial: AssistantMessagePartial }
  | { type: "tool_call_delta"; id: string; arguments: string; partial: AssistantMessagePartial }
  | { type: "tool_call_end"; id: string; name: string; arguments: string; partial: AssistantMessagePartial }
  | { type: "model_requested"; model: ModelRef; usage: LlmModelUsage }
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
// Provider call context and stream function types
// ---------------------------------------------------------------------------

export type JsonPrimitive = null | boolean | number | string;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };
export type JsonObject = Readonly<Record<string, JsonValue>>;

export type ScopeRef = readonly { kind: string; id: string }[];

export type ToolKind =
  | "read"
  | "edit"
  | "delete"
  | "move"
  | "search"
  | "execute"
  | "think"
  | "fetch"
  | "switch_mode"
  | "other";

export type ToolCallStatus = "pending" | "in_progress" | "completed" | "failed";

export type ToolCallContent =
  | { type: "content"; content: ContentBlock }
  | { type: "diff"; path: string; oldText: string | null; newText: string }
  | { type: "terminal"; terminalId: string };

export type ToolCallLocation = { path: string; line?: number };

export type ToolCall = {
  toolCallId: string;
  title: string;
  kind: ToolKind;
  status: ToolCallStatus;
  content?: ToolCallContent[];
  locations?: ToolCallLocation[];
  rawInput?: JsonValue;
  rawOutput?: JsonValue;
  _meta?: JsonObject;
};

export type ToolCallUpdate = { toolCallId: string } & Partial<Omit<ToolCall, "toolCallId">>;

export type ToolAnnotations = {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
};

export type RunInteractionKind = "user_input" | "permission" | "elicitation" | "confirmation";

export type RunInteractionRequest = Readonly<{
  id?: string;
  kind: RunInteractionKind;
  prompt: string;
  payload?: JsonValue;
  toolCallId?: string;
  result?: Readonly<{
    answered?: string;
    replied?: string;
    cancelled?: string;
  }>;
}>;

export type ToolDefinitionSummary = Readonly<{
  name: string;
  description: string;
  parameters?: JsonValue;
  _meta?: JsonObject;
}>;

export type ToolCallOutcome =
  | Readonly<{ ok: true; content: JsonValue }>
  | Readonly<{ ok: false; error: string; content?: JsonValue }>;

export type ProviderCallContext = {
  signal: AbortSignal;
  run: { id: string; agentId: string; scope: ScopeRef; cwd: string };
  /** Ask the user through the Run Interaction system and await the answer while the Run stays live. Rejects on abort/cancel. */
  interact(request: RunInteractionRequest): Promise<JsonValue>;
  /** The tools this Run would give the model, and ways to call or report tool execution. */
  tools: {
    list(): readonly ToolDefinitionSummary[];
    call(name: string, args: JsonValue): Promise<ToolCallOutcome>;
    /** Report execution of an external tool call or an update to one. */
    report(update: ToolCall | ToolCallUpdate): void;
  };
};

export type ProviderStreamFn = (
  model: Model,
  request: LlmRequest,
  ctx: ProviderCallContext,
) => AsyncIterable<LlmStreamEvent>;

export type StreamFn = (
  request: LlmRequest,
  ctx?: ProviderCallContext | Partial<ProviderCallContext>,
) => AsyncIterable<LlmStreamEvent>;

export function createProviderCallContext(
  overrides?: Partial<ProviderCallContext>,
): ProviderCallContext {
  return {
    signal: overrides?.signal ?? new AbortController().signal,
    run: overrides?.run ?? {
      id: "run-0",
      agentId: "agent-0",
      scope: [],
      cwd: "",
    },
    interact: overrides?.interact ?? (async () => null),
    tools: {
      list: () => overrides?.tools?.list() ?? [],
      call: async (name, args) => overrides?.tools?.call?.(name, args) ?? { ok: true, content: null },
      report: (update) => overrides?.tools?.report?.(update),
    },
  };
}
