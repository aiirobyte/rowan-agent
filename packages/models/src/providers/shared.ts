import type { LlmRequest, LlmModelUsage, LlmTokenUsage } from "../protocol";

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

/** Recover valid JSON from possibly-malformed model tool output. */
export function sanitizeToolInput(input: unknown): unknown {
  if (typeof input !== "string") return input;
  try { return JSON.parse(input); } catch { return input; }
}

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
  headers?: Record<string, string>;
  /** Maximum idle gap while waiting for response headers or body bytes. */
  timeoutMs?: number;
  /** Number of retry attempts after the initial request. */
  maxRetries?: number;
  retryDelayMs?: number;
  fetch?: ProviderFetch;
};

export type BaseProviderConfigInput = Partial<BaseProviderConfig>;

export function resolveBaseProviderConfig(
  input: BaseProviderConfigInput,
  defaultBaseUrl: string,
): BaseProviderConfig {
  return {
    baseUrl: normalizeBaseUrl(nonEmpty(input.baseUrl) ?? defaultBaseUrl),
    apiKey: requireValue(
      "API key",
      input.apiKey,
      "model.apiKey is required (set apiKey in config.yaml or pass --api-key)",
    ),
    model: requireValue("model", input.model, "model.id is required"),
    ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
    ...(input.maxTokens !== undefined ? { maxTokens: input.maxTokens } : {}),
    ...(input.headers ? { headers: { ...input.headers } } : {}),
    ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
    ...(input.maxRetries !== undefined ? { maxRetries: input.maxRetries } : {}),
    ...(input.retryDelayMs !== undefined ? { retryDelayMs: input.retryDelayMs } : {}),
    ...(input.fetch ? { fetch: input.fetch } : {}),
  };
}
