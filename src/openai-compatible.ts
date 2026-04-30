import { buildOpenAICompatibleMessages, type ChatMessage } from "./prompt-builder";
import { extractJsonObject } from "./json-extract";
import type {
  LlmContext,
  ModelStreamEvent,
  StreamFn,
  StreamOptions,
  Task,
  Tool,
  ToolCall,
  VerificationResult,
} from "./types";
import { createId, Validators } from "./types";

export type OpenAICompatibleFetch = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => ReturnType<typeof fetch>;

export type OpenAICompatibleConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  timeoutMs?: number;
  fetch?: OpenAICompatibleFetch;
  tools?: Tool[];
  responseFormat?: boolean;
};

export type ResolveOpenAICompatibleConfigInput = {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
  timeoutMs?: number;
  fetch?: OpenAICompatibleFetch;
  tools?: Tool[];
  responseFormat?: boolean;
  env?: Record<string, string | undefined>;
};

export class OpenAICompatibleError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(input: {
    code: string;
    message: string;
    status?: number;
    retryable?: boolean;
    details?: Record<string, unknown>;
  }) {
    super(input.message);
    this.name = "OpenAICompatibleError";
    this.code = input.code;
    this.status = input.status;
    this.retryable = input.retryable ?? false;
    this.details = input.details;
  }
}

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      refusal?: string | null;
    };
  }>;
};

type ExecuteModelOutput = {
  message?: string;
  toolCalls?: unknown[];
};

function defaultEnv(): Record<string, string | undefined> {
  return process.env as Record<string, string | undefined>;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function requireValue(name: string, value: string | undefined, hint: string): string {
  const normalized = nonEmpty(value);
  if (!normalized) {
    throw new OpenAICompatibleError({
      code: "missing_config",
      message: `Missing ${name}: ${hint}.`,
    });
  }
  return normalized;
}

export function resolveOpenAICompatibleConfig(
  input: ResolveOpenAICompatibleConfigInput = {},
): OpenAICompatibleConfig {
  const env = input.env ?? defaultEnv();
  const baseUrl =
    nonEmpty(input.baseUrl) ?? nonEmpty(env.ROWAN_OPENAI_BASE_URL) ?? "https://api.openai.com/v1";
  const apiKey = nonEmpty(input.apiKey) ?? nonEmpty(env.ROWAN_OPENAI_API_KEY);
  const model = nonEmpty(input.model) ?? nonEmpty(env.ROWAN_MODEL);

  return {
    baseUrl: normalizeBaseUrl(baseUrl),
    apiKey: requireValue("API key", apiKey, "set ROWAN_OPENAI_API_KEY or pass --api-key"),
    model: requireValue("model", model, "set ROWAN_MODEL or pass --model"),
    ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
    ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
    ...(input.fetch ? { fetch: input.fetch } : {}),
    ...(input.tools ? { tools: input.tools } : {}),
    ...(input.responseFormat !== undefined ? { responseFormat: input.responseFormat } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createRequestSignal(input: {
  signal?: AbortSignal;
  timeoutMs?: number;
}): { signal?: AbortSignal; cleanup: () => void } {
  if (!input.signal && !input.timeoutMs) {
    return { cleanup: () => undefined };
  }

  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const abortFromParent = () => {
    controller.abort(input.signal?.reason ?? new Error("Request aborted."));
  };

  if (input.signal?.aborted) {
    abortFromParent();
  } else {
    input.signal?.addEventListener("abort", abortFromParent, { once: true });
  }

  if (input.timeoutMs) {
    timeout = setTimeout(() => {
      controller.abort(new Error(`Request timed out after ${input.timeoutMs}ms.`));
    }, input.timeoutMs);
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      if (timeout) {
        clearTimeout(timeout);
      }
      input.signal?.removeEventListener("abort", abortFromParent);
    },
  };
}

async function readErrorBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      return await response.json();
    }
    return await response.text();
  } catch {
    return null;
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function getResponseContent(data: ChatCompletionResponse): string {
  const message = data.choices?.[0]?.message;
  if (message?.refusal) {
    throw new OpenAICompatibleError({
      code: "model_refusal",
      message: `Model refused the request: ${message.refusal}`,
      details: { refusal: message.refusal },
    });
  }

  const content = message?.content;
  if (!content || content.trim().length === 0) {
    throw new OpenAICompatibleError({
      code: "empty_model_output",
      message: "Model response did not include message content.",
      details: { response: data },
    });
  }

  return content;
}

function normalizeHttpError(response: Response, body: unknown): OpenAICompatibleError {
  return new OpenAICompatibleError({
    code: "http_error",
    message: `OpenAI-compatible request failed with status ${response.status}.`,
    status: response.status,
    retryable: isRetryableStatus(response.status),
    details: {
      status: response.status,
      statusText: response.statusText,
      body,
    },
  });
}

export async function callOpenAICompatibleChatCompletion(
  config: OpenAICompatibleConfig,
  messages: ChatMessage[],
  options: StreamOptions = {},
): Promise<string> {
  const fetchImpl = config.fetch ?? fetch;
  const { signal, cleanup } = createRequestSignal({
    signal: options.signal,
    timeoutMs: config.timeoutMs,
  });

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    temperature: config.temperature ?? 0,
  };

  if (config.responseFormat !== false) {
    body.response_format = { type: "json_object" };
  }

  try {
    const response = await fetchImpl(`${normalizeBaseUrl(config.baseUrl)}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      throw normalizeHttpError(response, await readErrorBody(response));
    }

    let data: ChatCompletionResponse;
    try {
      data = (await response.json()) as ChatCompletionResponse;
    } catch (error) {
      throw new OpenAICompatibleError({
        code: "invalid_http_json",
        message: "OpenAI-compatible response body was not valid JSON.",
        details: { error: error instanceof Error ? error.message : String(error) },
      });
    }

    return getResponseContent(data);
  } catch (error) {
    if (error instanceof OpenAICompatibleError) {
      throw error;
    }
    if (signal?.aborted) {
      throw new OpenAICompatibleError({
        code: "request_aborted",
        message: signal.reason instanceof Error ? signal.reason.message : "OpenAI-compatible request aborted.",
        retryable: true,
      });
    }
    throw new OpenAICompatibleError({
      code: "request_failed",
      message: error instanceof Error ? error.message : "OpenAI-compatible request failed.",
      retryable: true,
    });
  } finally {
    cleanup();
  }
}

function validationError(phase: LlmContext["phase"], error: unknown): OpenAICompatibleError {
  return new OpenAICompatibleError({
    code: "invalid_model_schema",
    message: `Model output for ${phase} did not match the expected schema.`,
    details: { error: error instanceof Error ? error.message : String(error) },
  });
}

function normalizeTaskOutput(value: unknown, context: Extract<LlmContext, { phase: "plan" }>): Task {
  const raw = isRecord(value) && isRecord(value.task) ? value.task : value;
  if (!isRecord(raw)) {
    throw validationError("plan", "Expected an object containing a task.");
  }

  const normalized = {
    id: createId("task"),
    skillIds: context.session.skills.map((skill) => skill.id),
    status: "pending",
    attempts: 0,
    ...raw,
  };

  try {
    return Validators.task.Parse(normalized);
  } catch (error) {
    throw validationError("plan", error);
  }
}

function normalizeExecuteOutput(value: unknown): { message?: string; toolCalls: ToolCall[] } {
  if (!isRecord(value)) {
    throw validationError("execute", "Expected an execute output object.");
  }

  const output = value as ExecuteModelOutput;
  const rawToolCalls = Array.isArray(output.toolCalls) ? output.toolCalls : [];
  const toolCalls = rawToolCalls.map((toolCall) => {
    if (!isRecord(toolCall)) {
      throw validationError("execute", "Each tool call must be an object.");
    }

    try {
      return Validators.toolCall.Parse({
        id: createId("call"),
        args: {},
        ...toolCall,
      });
    } catch (error) {
      throw validationError("execute", error);
    }
  });

  return {
    ...(typeof output.message === "string" && output.message.length > 0
      ? { message: output.message }
      : {}),
    toolCalls,
  };
}

function normalizeVerificationOutput(value: unknown): VerificationResult {
  const raw = isRecord(value) && isRecord(value.verificationResult) ? value.verificationResult : value;
  if (!isRecord(raw)) {
    throw validationError("verify", "Expected a verification result object.");
  }

  try {
    return Validators.verificationResult.Parse({
      evidence: [],
      failedCriteria: [],
      ...raw,
    });
  } catch (error) {
    throw validationError("verify", error);
  }
}

async function fetchModelJson(config: OpenAICompatibleConfig, context: LlmContext, options: StreamOptions) {
  const messages = buildOpenAICompatibleMessages({ context, tools: config.tools });
  const content = await callOpenAICompatibleChatCompletion(config, messages, options);
  return extractJsonObject(content);
}

export function createOpenAICompatibleStream(config: OpenAICompatibleConfig): StreamFn {
  const normalizedConfig = {
    ...config,
    baseUrl: normalizeBaseUrl(config.baseUrl),
  };

  return async function* openAICompatibleStream(_model, context, options): AsyncIterable<ModelStreamEvent> {
    const value = await fetchModelJson(normalizedConfig, context, options);

    if (context.phase === "plan") {
      yield {
        type: "structured_output",
        value: normalizeTaskOutput(value, context),
      };
      yield { type: "done" };
      return;
    }

    if (context.phase === "execute") {
      const output = normalizeExecuteOutput(value);
      if (output.message) {
        yield { type: "text_delta", text: output.message };
      }
      for (const toolCall of output.toolCalls) {
        yield { type: "tool_call", toolCall };
      }
      yield { type: "done" };
      return;
    }

    yield {
      type: "structured_output",
      value: normalizeVerificationOutput(value),
    };
    yield { type: "done" };
  };
}
