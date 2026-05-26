export type LlmModelRef = {
  provider: string;
  name: string;
};

export type LlmTokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type LlmModelUsage = LlmTokenUsage & {
  inputMessages: number;
};

export type LlmMessage = {
  role: "user" | "assistant";
  content: string;
};

export type LlmToolDefinition = {
  name: string;
  description: string;
  parameters: unknown;
};

export type LlmRequest = {
  model: LlmModelRef;
  system?: string;
  messages: LlmMessage[];
  tools?: LlmToolDefinition[];
};

export type LlmToolCall = {
  id: string;
  name: string;
  arguments: unknown;
};

export type LlmStopReason = "end_turn" | "tool_use" | "max_tokens" | "stop" | "unknown";

export type LlmResponse = {
  content: string;
  toolCalls?: LlmToolCall[];
  stopReason?: LlmStopReason;
  usage?: LlmTokenUsage;
};

export type LlmStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_call"; id: string; name: string; arguments: string }
  | {
      type: "model_requested";
      model: LlmModelRef;
      usage: LlmModelUsage;
    }
  | { type: "done"; response?: LlmResponse };

export type LlmStreamOptions = {
  signal?: AbortSignal;
};

export type StreamFn = (
  request: LlmRequest,
  options: LlmStreamOptions,
) => AsyncIterable<LlmStreamEvent>;
