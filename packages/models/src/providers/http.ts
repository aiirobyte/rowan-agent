import type { LlmRequest, LlmStreamEvent } from "../protocol";
import { iterateSseMessages, type ServerSentEvent } from "../sse";
import type { BaseProviderConfig, ProviderFetch } from "./shared";
import {
  ProviderError,
  asTrimmedString,
  isRecord,
  summarizeRequestUsage,
  truncateString,
} from "./shared";

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 500;
const MAX_ERROR_BODY_BYTES = 64 * 1024;
const MAX_PROVIDER_MESSAGE_LENGTH = 500;

export type ProviderTransportConfig = Pick<
  BaseProviderConfig,
  "model" | "headers" | "timeoutMs" | "maxRetries" | "retryDelayMs" | "fetch"
>;

export interface ProviderRequestSpec {
  /** Transport policy and the production/test fetch adapter. */
  config: ProviderTransportConfig;
  /** Fully resolved URL. Included in every structured failure. */
  endpoint: string;
  /** Rebuilt for every attempt so one-shot bodies can be recreated safely. */
  request: () => Omit<RequestInit, "signal">;
  /** User-facing subject in HTTP errors. Defaults to "Request". */
  requestName?: string;
  signal?: AbortSignal;
}

export interface ProviderStreamRequestSpec extends ProviderRequestSpec {
  llmRequest: LlmRequest;
}

export interface ProviderResponse {
  readonly contentType?: string;
  readonly isEventStream: boolean;
  /** The body is single-consumption across json(), text(), and sse(). */
  json<T>(): Promise<T>;
  text(): Promise<string>;
  sse(): AsyncIterable<ServerSentEvent>;
}

interface RequestActivity {
  signal?: AbortSignal;
  beginWait(): void;
  endWait(): void;
  cleanup(): void;
}

function timeoutError(timeoutMs: number): ProviderError {
  return new ProviderError({
    code: "request_timeout",
    message: `Request timed out after ${timeoutMs}ms.`,
    retryable: true,
    details: { timeoutMs },
  });
}

function callerAbortError(signal: AbortSignal): ProviderError {
  return new ProviderError({
    code: "request_aborted",
    message: signal.reason instanceof Error ? signal.reason.message : "Request aborted.",
    retryable: false,
  });
}

function normalizeRequestError(
  error: unknown,
  requestSignal?: AbortSignal,
  callerSignal?: AbortSignal,
): ProviderError {
  if (callerSignal?.aborted) return callerAbortError(callerSignal);
  if (error instanceof ProviderError) return error;

  if (requestSignal?.aborted) {
    if (requestSignal.reason instanceof ProviderError) return requestSignal.reason;
    return new ProviderError({
      code: "request_aborted",
      message: requestSignal.reason instanceof Error ? requestSignal.reason.message : "Request aborted.",
      retryable: false,
    });
  }

  return new ProviderError({
    code: "request_failed",
    message: error instanceof Error ? error.message : "Request failed.",
    retryable: true,
  });
}

function withRequestContext(
  error: ProviderError,
  spec: ProviderRequestSpec,
  input: { retryable?: boolean; partialOutput?: boolean } = {},
): ProviderError {
  const contextual = new ProviderError({
    code: error.code,
    message: error.message,
    retryable: input.retryable ?? error.retryable,
    ...(error.status !== undefined ? { status: error.status } : {}),
    details: {
      ...error.details,
      endpoint: spec.endpoint,
      model: spec.config.model,
      ...(input.partialOutput !== undefined ? { partialOutput: input.partialOutput } : {}),
    },
  });
  contextual.stack = error.stack;
  return contextual;
}

function responseDecodeError(error: unknown): ProviderError {
  return new ProviderError({
    code: "response_decode_error",
    message: "Provider response could not be decoded.",
    retryable: false,
    details: {
      ...(error instanceof Error ? { cause: truncateString(error.message, MAX_PROVIDER_MESSAGE_LENGTH) } : {}),
    },
  });
}

function raceWithAbort<T>(promise: PromiseLike<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return Promise.resolve(promise);
  if (signal.aborted) return Promise.reject(signal.reason ?? new Error("Request aborted."));

  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener("abort", abort);
      reject(signal.reason ?? new Error("Request aborted."));
    };
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(promise).then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

/**
 * timeoutMs bounds each active wait for response headers or the next body
 * chunk. It is disarmed while a decoder or downstream consumer is working.
 */
function createRequestActivity(input: {
  signal?: AbortSignal;
  timeoutMs?: number;
}): RequestActivity {
  if (!input.signal && !(input.timeoutMs && input.timeoutMs > 0)) {
    return {
      beginWait: () => undefined,
      endWait: () => undefined,
      cleanup: () => undefined,
    };
  }

  const controller = new AbortController();
  let idleTimeout: ReturnType<typeof setTimeout> | undefined;
  const abortFromParent = () => controller.abort(input.signal?.reason ?? new Error("Request aborted."));
  const beginWait = () => {
    if (controller.signal.aborted || !(input.timeoutMs && input.timeoutMs > 0)) return;
    if (idleTimeout) clearTimeout(idleTimeout);
    idleTimeout = setTimeout(() => controller.abort(timeoutError(input.timeoutMs!)), input.timeoutMs);
  };
  const endWait = () => {
    if (idleTimeout) clearTimeout(idleTimeout);
    idleTimeout = undefined;
  };

  if (input.signal?.aborted) abortFromParent();
  else input.signal?.addEventListener("abort", abortFromParent, { once: true });
  beginWait();

  return {
    signal: controller.signal,
    beginWait,
    endWait,
    cleanup() {
      endWait();
      input.signal?.removeEventListener("abort", abortFromParent);
    },
  };
}

interface TrackedBody {
  stream: ReadableStream<Uint8Array>;
  dispose(reason?: unknown): Promise<void>;
}

function trackedBody(
  body: ReadableStream<Uint8Array>,
  activity: RequestActivity,
): TrackedBody {
  const reader = body.getReader();
  const signal = activity.signal;
  let finished = false;
  let released = false;

  const release = () => {
    if (released) return;
    released = true;
    reader.releaseLock();
  };
  const dispose = async (reason?: unknown) => {
    if (finished) {
      release();
      return;
    }
    finished = true;
    activity.endWait();
    try {
      await reader.cancel(reason).catch(() => undefined);
    } finally {
      release();
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (finished) return;
      if (signal?.aborted) {
        await dispose(signal.reason);
        throw normalizeRequestError(signal.reason, signal);
      }

      try {
        activity.beginWait();
        const { value, done } = await raceWithAbort(reader.read(), signal);
        if (finished) return;
        if (done) {
          finished = true;
          controller.close();
          release();
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        const failure = normalizeRequestError(error, signal);
        await dispose(failure);
        throw failure;
      } finally {
        activity.endWait();
      }
    },
    async cancel(reason) {
      await dispose(reason);
    },
  }, { highWaterMark: 0 });

  return { stream, dispose };
}

async function readText(body: ReadableStream<Uint8Array>, maxBytes?: number): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let capturedBytes = 0;
  let text = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      if (maxBytes === undefined) {
        text += decoder.decode(value, { stream: true });
        continue;
      }

      const remaining = Math.max(0, maxBytes + 1 - capturedBytes);
      const captured = value.subarray(0, remaining);
      capturedBytes += captured.byteLength;
      text += decoder.decode(captured, { stream: true });
      if (captured.byteLength < value.byteLength || capturedBytes > maxBytes) {
        await reader.cancel("Provider response exceeded capture limit.").catch(() => undefined);
        break;
      }
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

function contentTypeOf(response: Response): string | undefined {
  return asTrimmedString(response.headers.get("content-type"))
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
}

function isJsonContentType(contentType: string | undefined): boolean {
  return contentType?.includes("/json") === true || contentType?.includes("+json") === true;
}

function providerErrorFromBody(body: unknown): Record<string, unknown> | undefined {
  if (!isRecord(body)) return undefined;

  const error = body.error;
  if (typeof error === "string") {
    const message = asTrimmedString(error);
    return message ? { message } : undefined;
  }

  if (isRecord(error)) return { ...error };

  const source = body;
  const message = asTrimmedString(source.message);
  const code = asTrimmedString(source.code);
  const type = asTrimmedString(source.type);
  if (!message && !code && !type) return undefined;
  return { ...(message ? { message } : {}), ...(code ? { code } : {}), ...(type ? { type } : {}) };
}

function responseDetails(response: Response, body: unknown): Record<string, unknown> {
  const responseContentType = contentTypeOf(response);
  const responseBody = typeof body === "string" ? asTrimmedString(body) : undefined;
  return {
    ...(responseContentType ? { responseContentType } : {}),
    ...(responseBody ? { responseBody: truncateString(responseBody) } : {}),
  };
}

async function readErrorBody(response: Response, activity: RequestActivity): Promise<unknown> {
  if (!response.body) return null;
  const body = trackedBody(response.body, activity);
  let text: string;
  try {
    text = await readText(body.stream, MAX_ERROR_BODY_BYTES);
  } finally {
    await body.dispose("Provider error body captured.");
  }
  if (!isJsonContentType(contentTypeOf(response))) return text;
  try { return JSON.parse(text); } catch { return text; }
}

async function normalizeHttpError(
  response: Response,
  spec: ProviderRequestSpec,
  activity: RequestActivity,
): Promise<ProviderError> {
  const body = await readErrorBody(response, activity);
  const providerError = providerErrorFromBody(body);
  const providerMessage = asTrimmedString(providerError?.message);
  const displayProviderMessage = providerMessage && !/(?:<!doctype\s+html|<html\b)/i.test(providerMessage)
    ? truncateString(providerMessage, MAX_PROVIDER_MESSAGE_LENGTH)
    : undefined;
  const statusSummary = response.statusText
    ? `${response.status} ${response.statusText}`
    : String(response.status);
  const requestName = spec.requestName ?? "Request";

  return new ProviderError({
    code: "http_error",
    message: displayProviderMessage
      ? `${requestName} failed (${statusSummary}): ${displayProviderMessage}`
      : `${requestName} failed with status ${statusSummary}.`,
    status: response.status,
    retryable: response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500,
    details: {
      endpoint: spec.endpoint,
      model: spec.config.model,
      status: response.status,
      ...(providerError ? { providerError } : {}),
      ...responseDetails(response, body),
    },
  });
}

interface ManagedProviderResponse extends ProviderResponse {
  dispose(reason?: unknown): Promise<void>;
}

function createProviderResponse(response: Response, activity: RequestActivity): ManagedProviderResponse {
  const contentType = contentTypeOf(response);
  let consumed = false;
  let body: TrackedBody | undefined;

  const takeBody = (): ReadableStream<Uint8Array> => {
    if (consumed) {
      throw new ProviderError({
        code: "response_body_consumed",
        message: "Provider response body has already been consumed.",
      });
    }
    consumed = true;
    body = trackedBody(response.body!, activity);
    return body.stream;
  };

  return {
    contentType,
    isEventStream: contentType === "text/event-stream",
    async json<T>() {
      const text = await readText(takeBody());
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new ProviderError({
          code: "response_decode_error",
          message: "Provider returned an invalid JSON response.",
          retryable: false,
          details: { ...(contentType ? { responseContentType: contentType } : {}) },
        });
      }
    },
    async text() {
      return readText(takeBody());
    },
    sse() {
      return iterateSseMessages(takeBody(), activity.signal);
    },
    async dispose(reason) {
      if (body) {
        await body.dispose(reason);
      } else if (!consumed) {
        consumed = true;
        await response.body!.cancel(reason).catch(() => undefined);
      }
    },
  };
}

async function openResponse(
  spec: ProviderRequestSpec,
  activity: RequestActivity,
): Promise<ManagedProviderResponse> {
  if (spec.signal?.aborted) throw callerAbortError(spec.signal);

  const fetchImpl: ProviderFetch = spec.config.fetch ?? fetch;
  let response: Response;
  try {
    const init = spec.request();
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, name) => { headers[name] = value; });
    new Headers(spec.config.headers).forEach((value, name) => { headers[name] = value; });
    response = await raceWithAbort(
      fetchImpl(spec.endpoint, { ...init, headers, signal: activity.signal }),
      activity.signal,
    );
  } catch (error) {
    throw normalizeRequestError(error, activity.signal, spec.signal);
  }
  activity.endWait();

  if (!response.ok) throw await normalizeHttpError(response, spec, activity);
  if (!response.body) {
    throw new ProviderError({ code: "no_body", message: "Response body is null.", retryable: true });
  }
  return createProviderResponse(response, activity);
}

function retryNumber(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function canRetry(error: ProviderError, attempt: number, spec: ProviderRequestSpec): boolean {
  return error.retryable
    && attempt <= retryNumber(spec.config.maxRetries, DEFAULT_MAX_RETRIES)
    && !spec.signal?.aborted;
}

async function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw callerAbortError(signal);
  if (delayMs <= 0) return;

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, delayMs);
    const abort = () => {
      clearTimeout(timeout);
      reject(signal ? callerAbortError(signal) : new ProviderError({ code: "request_aborted", message: "Request aborted." }));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

async function* runProviderOperation<T>(
  spec: ProviderRequestSpec,
  consume: (response: ProviderResponse) => AsyncIterable<T>,
  isCommitted: (item: T) => boolean,
): AsyncGenerator<T> {
  const retryDelayMs = retryNumber(spec.config.retryDelayMs, DEFAULT_RETRY_DELAY_MS);
  let attempt = 0;

  while (true) {
    attempt += 1;
    const activity = createRequestActivity({ signal: spec.signal, timeoutMs: spec.config.timeoutMs });
    let failure: ProviderError | undefined;
    let committed = false;
    let responseReceived = false;
    let response: ManagedProviderResponse | undefined;

    try {
      response = await openResponse(spec, activity);
      responseReceived = true;
      for await (const item of consume(response)) {
        if (spec.signal?.aborted) throw callerAbortError(spec.signal);
        if (activity.signal?.aborted) {
          throw normalizeRequestError(activity.signal.reason, activity.signal, spec.signal);
        }
        if (isCommitted(item)) committed = true;
        yield item;
      }
      return;
    } catch (error) {
      const normalized = error instanceof ProviderError || !responseReceived
        ? normalizeRequestError(error, activity.signal, spec.signal)
        : responseDecodeError(error);
      failure = withRequestContext(normalized, spec);
      if (committed && failure.retryable) {
        failure = withRequestContext(failure, spec, { retryable: false, partialOutput: true });
      }
    } finally {
      await response?.dispose(failure ?? new Error("Provider operation finished."));
      activity.cleanup();
    }

    if (committed || !canRetry(failure, attempt, spec)) throw failure;
    try {
      await waitForRetry(retryDelayMs * 2 ** (attempt - 1), spec.signal);
    } catch (error) {
      throw withRequestContext(normalizeRequestError(error, undefined, spec.signal), spec);
    }
  }
}

export async function executeProviderRequest<T>(
  spec: ProviderRequestSpec,
  consume: (response: ProviderResponse) => Promise<T>,
): Promise<T> {
  let received = false;
  let result: T | undefined;

  async function* consumeOnce(response: ProviderResponse): AsyncGenerator<T> {
    yield await consume(response);
  }

  for await (const item of runProviderOperation(spec, consumeOnce, () => true)) {
    received = true;
    result = item;
  }

  if (!received) {
    throw new ProviderError({
      code: "response_body_missing",
      message: "Provider request completed without a response value.",
    });
  }
  return result as T;
}

function isPartialOutput(event: LlmStreamEvent): boolean {
  return event.type === "text_delta"
    || event.type === "thinking_delta"
    || event.type === "tool_call_start"
    || event.type === "tool_call_delta"
    || event.type === "tool_call_end";
}

export async function* streamProviderRequest(
  spec: ProviderStreamRequestSpec,
  consume: (response: ProviderResponse) => AsyncIterable<LlmStreamEvent>,
): AsyncGenerator<LlmStreamEvent> {
  const requestUsage = summarizeRequestUsage(spec.llmRequest);
  let emittedModelRequest = false;
  let emittedStart = false;

  async function* consumeStream(response: ProviderResponse): AsyncGenerator<LlmStreamEvent> {
    yield { type: "model_requested", model: spec.llmRequest.model, usage: { ...requestUsage } };
    yield* consume(response);
  }

  try {
    for await (const event of runProviderOperation(spec, consumeStream, isPartialOutput)) {
      if (event.type === "model_requested") {
        if (emittedModelRequest) continue;
        emittedModelRequest = true;
      } else if (event.type === "start") {
        if (emittedStart) continue;
        emittedStart = true;
      }
      yield event;
    }
  } catch (error) {
    const failure = withRequestContext(normalizeRequestError(error, undefined, spec.signal), spec);
    yield { type: "error", error: failure };
    yield { type: "done", response: { content: "", stopReason: "error" } };
  }
}
