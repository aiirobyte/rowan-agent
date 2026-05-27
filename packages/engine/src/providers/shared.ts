import type { LlmRequest, LlmModelUsage, LlmTokenUsage, LlmStreamOptions } from "../protocol";

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class ProviderError extends Error {
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
    this.name = "ProviderError";
    this.code = input.code;
    this.status = input.status;
    this.retryable = input.retryable ?? false;
    this.details = input.details;
  }
}

// Re-export under legacy alias for backward compatibility
export { ProviderError as OpenAICompatibleError };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function defaultEnv(): Record<string, string | undefined> {
  return process.env as Record<string, string | undefined>;
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export function requireValue(name: string, value: string | undefined, hint: string): string {
  const normalized = nonEmpty(value);
  if (!normalized) {
    throw new ProviderError({
      code: "missing_config",
      message: `Missing ${name}: ${hint}.`,
    });
  }
  return normalized;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function asTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function truncateString(value: string, maxLength = 4_000): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

// ---------------------------------------------------------------------------
// Request signal / timeout
// ---------------------------------------------------------------------------

export function createRequestSignal(input: {
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
      if (timeout) clearTimeout(timeout);
      input.signal?.removeEventListener("abort", abortFromParent);
    },
  };
}

// ---------------------------------------------------------------------------
// HTTP error handling
// ---------------------------------------------------------------------------

export async function readErrorBody(response: Response): Promise<unknown> {
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

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

export function normalizeRequestError(error: unknown, signal?: AbortSignal): ProviderError {
  if (error instanceof ProviderError) return error;

  if (signal?.aborted) {
    return new ProviderError({
      code: "request_aborted",
      message: signal.reason instanceof Error ? signal.reason.message : "Request aborted.",
      retryable: true,
    });
  }

  return new ProviderError({
    code: "request_failed",
    message: error instanceof Error ? error.message : "Request failed.",
    retryable: true,
  });
}

// ---------------------------------------------------------------------------
// Retry logic
// ---------------------------------------------------------------------------

export const DEFAULT_MAX_RETRIES = 2;
export const DEFAULT_RETRY_DELAY_MS = 500;

export function normalizeRetryNumber(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function shouldRetry(input: {
  error: ProviderError;
  attempts: number;
  maxRetries: number;
  signal?: AbortSignal;
}): boolean {
  return input.error.retryable && input.attempts < input.maxRetries && !input.signal?.aborted;
}

export async function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (delayMs <= 0) return;

  if (signal?.aborted) {
    throw new ProviderError({
      code: "request_aborted",
      message: "Request aborted.",
      retryable: true,
    });
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, delayMs);
    const abort = () => {
      clearTimeout(timeout);
      reject(new ProviderError({
        code: "request_aborted",
        message: "Request aborted.",
        retryable: true,
      }));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

// ---------------------------------------------------------------------------
// Usage normalization
// ---------------------------------------------------------------------------

export type RawUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
};

export function normalizeUsage(usage: RawUsage | undefined): LlmTokenUsage | undefined {
  if (!usage) return undefined;

  const inputTokens = asNumber(usage.prompt_tokens) ?? asNumber(usage.input_tokens);
  const outputTokens = asNumber(usage.completion_tokens) ?? asNumber(usage.output_tokens);
  const totalTokens = asNumber(usage.total_tokens);

  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) {
    return undefined;
  }

  return {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
  };
}

export function summarizeRequestUsage(request: LlmRequest): Pick<LlmModelUsage, "inputMessages"> {
  return { inputMessages: request.messages.length + (request.system ? 1 : 0) };
}

// ---------------------------------------------------------------------------
// Config types
// ---------------------------------------------------------------------------

export type ProviderFetch = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => ReturnType<typeof fetch>;

export type BaseProviderConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  fetch?: ProviderFetch;
};
