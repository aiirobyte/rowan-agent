import { buildOpenAICompatiblePrompt, type ChatMessage } from "@rowan-agent/context";
import { extractJsonObject } from "./json-extract";
import type {
  LlmContext,
  LlmPhaseOutputMap,
  ModelCallUsage,
  ModelStreamEvent,
  StreamFn,
  StreamOptions,
  Task,
  TaskRoutingDecision,
  ToolDefinition,
  ToolCall,
  VerificationResult,
} from "@rowan-agent/protocol";
import { createDefaultCriteria, createId, Validators } from "@rowan-agent/protocol";

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
  maxRetries?: number;
  retryDelayMs?: number;
  fetch?: OpenAICompatibleFetch;
  tools?: ToolDefinition[];
  responseFormat?: boolean;
};

export type ResolveOpenAICompatibleConfigInput = {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  fetch?: OpenAICompatibleFetch;
  tools?: ToolDefinition[];
  responseFormat?: boolean;
  env?: Record<string, string | undefined>;
};

const DEFAULT_MAX_RETRIES = 1;
const DEFAULT_RETRY_DELAY_MS = 250;

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
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
  };
};

export type OpenAICompatibleChatCompletionResult = {
  content: string;
  requestContent: string;
  responseContent: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
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
    ...(input.maxRetries !== undefined ? { maxRetries: input.maxRetries } : {}),
    ...(input.retryDelayMs !== undefined ? { retryDelayMs: input.retryDelayMs } : {}),
    ...(input.fetch ? { fetch: input.fetch } : {}),
    ...(input.tools ? { tools: input.tools } : {}),
    ...(input.responseFormat !== undefined ? { responseFormat: input.responseFormat } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRecordValue(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined) {
      return record[key];
    }

    const matchedKey = Object.keys(record).find((recordKey) => recordKey.toLowerCase() === key.toLowerCase());
    if (matchedKey && record[matchedKey] !== undefined) {
      return record[matchedKey];
    }
  }

  return undefined;
}

function unwrapRecord(value: unknown, ...keys: string[]): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const wrapped = getRecordValue(value, ...keys);
  return isRecord(wrapped) ? wrapped : value;
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

function truncateString(value: string, maxLength = 4_000): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}... [truncated]` : value;
}

function sanitizeErrorBody(value: unknown): unknown {
  if (typeof value === "string") {
    return truncateString(value);
  }

  return value;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function asTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function providerErrorFromBody(body: unknown): Record<string, unknown> | undefined {
  if (typeof body === "string") {
    const message = asTrimmedString(body);
    return message ? { message: truncateString(message) } : undefined;
  }

  if (!isRecord(body)) {
    return undefined;
  }

  const error = getRecordValue(body, "error");
  if (typeof error === "string") {
    const message = asTrimmedString(error);
    return message ? { message } : undefined;
  }

  const source = isRecord(error) ? error : body;
  const message = asTrimmedString(getRecordValue(source, "message"));
  const code = asTrimmedString(getRecordValue(source, "code"));
  const type = asTrimmedString(getRecordValue(source, "type"));
  const param = asTrimmedString(getRecordValue(source, "param"));

  if (!message && !code && !type && !param) {
    return undefined;
  }

  return {
    ...(message ? { message } : {}),
    ...(code ? { code } : {}),
    ...(type ? { type } : {}),
    ...(param ? { param } : {}),
  };
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

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function summarizeRequestUsage(messages: ChatMessage[]): Pick<ModelCallUsage, "inputMessages"> {
  return {
    inputMessages: messages.length,
  };
}

function normalizeProviderUsage(
  usage: ChatCompletionResponse["usage"],
): OpenAICompatibleChatCompletionResult["usage"] {
  if (!usage) {
    return undefined;
  }

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

function summarizeResponseUsage(
  result: OpenAICompatibleChatCompletionResult,
): Omit<ModelCallUsage, "inputMessages"> {
  return {
    ...(result.usage?.inputTokens !== undefined ? { inputTokens: result.usage.inputTokens } : {}),
    ...(result.usage?.outputTokens !== undefined ? { outputTokens: result.usage.outputTokens } : {}),
    ...(result.usage?.totalTokens !== undefined ? { totalTokens: result.usage.totalTokens } : {}),
  };
}

function normalizeHttpError(
  response: Response,
  body: unknown,
  context: { endpoint: string; model: string },
): OpenAICompatibleError {
  const providerError = providerErrorFromBody(body);
  const providerMessage = asTrimmedString(providerError?.message);
  const statusSummary = response.statusText
    ? `${response.status} ${response.statusText}`
    : String(response.status);
  const message = providerMessage
    ? `OpenAI-compatible request failed with status ${statusSummary}: ${providerMessage}`
    : `OpenAI-compatible request failed with status ${statusSummary}.`;

  return new OpenAICompatibleError({
    code: "http_error",
    message,
    status: response.status,
    retryable: isRetryableStatus(response.status),
    details: {
      endpoint: context.endpoint,
      model: context.model,
      status: response.status,
      statusText: response.statusText,
      ...(providerError ? { providerError } : {}),
      body: sanitizeErrorBody(body),
    },
  });
}

function buildChatCompletionBody(config: OpenAICompatibleConfig, messages: ChatMessage[]): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    temperature: config.temperature ?? 0,
  };

  if (config.responseFormat !== false) {
    body.response_format = { type: "json_object" };
  }

  return body;
}

function normalizeRetryNumber(value: number | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function abortMessage(signal?: AbortSignal): string {
  return signal?.reason instanceof Error ? signal.reason.message : "OpenAI-compatible request aborted.";
}

function normalizeRequestError(error: unknown, signal?: AbortSignal): OpenAICompatibleError {
  if (error instanceof OpenAICompatibleError) {
    return error;
  }

  if (signal?.aborted) {
    return new OpenAICompatibleError({
      code: "request_aborted",
      message: abortMessage(signal),
      retryable: true,
    });
  }

  return new OpenAICompatibleError({
    code: "request_failed",
    message: error instanceof Error ? error.message : "OpenAI-compatible request failed.",
    retryable: true,
  });
}

function withAttemptDetails(error: OpenAICompatibleError, attempts: number): OpenAICompatibleError {
  return new OpenAICompatibleError({
    code: error.code,
    message: error.message,
    ...(error.status !== undefined ? { status: error.status } : {}),
    retryable: error.retryable,
    details: {
      ...(error.details ?? {}),
      attempts,
    },
  });
}

function shouldRetryRequest(input: {
  error: OpenAICompatibleError;
  attempts: number;
  maxRetries: number;
  parentSignal?: AbortSignal;
}): boolean {
  return input.error.retryable && input.attempts - 1 < input.maxRetries && !input.parentSignal?.aborted;
}

async function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (delayMs <= 0) {
    return;
  }

  if (signal?.aborted) {
    throw new OpenAICompatibleError({
      code: "request_aborted",
      message: abortMessage(signal),
      retryable: true,
    });
  }

  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    };
    const timeout = setTimeout(() => {
      finish();
      resolve();
    }, delayMs);
    const abort = () => {
      finish();
      reject(
        new OpenAICompatibleError({
          code: "request_aborted",
          message: abortMessage(signal),
          retryable: true,
        }),
      );
    };

    signal?.addEventListener("abort", abort, { once: true });
  });
}

async function callOpenAICompatibleChatCompletionOnce(
  config: OpenAICompatibleConfig,
  messages: ChatMessage[],
  options: StreamOptions = {},
  requestBody = buildChatCompletionBody(config, messages),
): Promise<OpenAICompatibleChatCompletionResult> {
  const fetchImpl = config.fetch ?? fetch;
  const { signal, cleanup } = createRequestSignal({
    signal: options.signal,
    timeoutMs: config.timeoutMs,
  });
  const requestContent = JSON.stringify(requestBody, null, 2);

  try {
    const endpoint = `${normalizeBaseUrl(config.baseUrl)}/chat/completions`;
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal,
    });

    if (!response.ok) {
      throw normalizeHttpError(response, await readErrorBody(response), {
        endpoint,
        model: config.model,
      });
    }

    let responseContent: string;
    let data: ChatCompletionResponse;
    try {
      responseContent = await response.text();
      data = JSON.parse(responseContent) as ChatCompletionResponse;
    } catch (error) {
      throw new OpenAICompatibleError({
        code: "invalid_http_json",
        message: "OpenAI-compatible response body was not valid JSON.",
        details: { error: error instanceof Error ? error.message : String(error) },
      });
    }

    const usage = normalizeProviderUsage(data.usage);
    return {
      content: getResponseContent(data),
      requestContent,
      responseContent,
      ...(usage ? { usage } : {}),
    };
  } catch (error) {
    throw normalizeRequestError(error, signal);
  } finally {
    cleanup();
  }
}

export async function callOpenAICompatibleChatCompletion(
  config: OpenAICompatibleConfig,
  messages: ChatMessage[],
  options: StreamOptions = {},
  requestBody = buildChatCompletionBody(config, messages),
): Promise<OpenAICompatibleChatCompletionResult> {
  const maxRetries = normalizeRetryNumber(config.maxRetries, DEFAULT_MAX_RETRIES);
  const retryDelayMs = normalizeRetryNumber(config.retryDelayMs, DEFAULT_RETRY_DELAY_MS);
  let attempts = 0;

  while (true) {
    attempts += 1;

    try {
      return await callOpenAICompatibleChatCompletionOnce(config, messages, options, requestBody);
    } catch (error) {
      const requestError = normalizeRequestError(error, options.signal);
      if (!shouldRetryRequest({ error: requestError, attempts, maxRetries, parentSignal: options.signal })) {
        throw attempts > 1 ? withAttemptDetails(requestError, attempts) : requestError;
      }

      await waitForRetry(retryDelayMs * 2 ** (attempts - 1), options.signal);
    }
  }
}

function formatUnknown(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function validationError(phase: LlmContext["phase"], error: unknown): OpenAICompatibleError {
  const detail = formatUnknown(error);
  return new OpenAICompatibleError({
    code: "invalid_model_schema",
    message: `Model output for ${phase} did not match the expected schema: ${detail}`,
    details: { error: detail },
  });
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function shortTitle(input: string): string {
  const trimmed = input.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return "Respond to user";
  }
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed;
}

function normalizeStringArray(value: unknown, fallback: string[]): string[] {
  if (typeof value === "string" && value.trim().length > 0) {
    return [value.trim()];
  }

  if (!Array.isArray(value)) {
    return fallback;
  }

  return value.flatMap((item) => {
    if (typeof item === "string" && item.trim().length > 0) {
      return [item.trim()];
    }
    if (isRecord(item)) {
      const name = asString(getRecordValue(item, "name")) ?? asString(getRecordValue(item, "id"));
      return name ? [name] : [];
    }
    return [];
  });
}

function normalizeCriterionType(value: unknown): "model_judge" | "tool_observation" {
  const type = asString(value)?.toLowerCase();
  return type === "tool_observation" ? "tool_observation" : "model_judge";
}

function normalizeAcceptanceCriteria(value: unknown, instruction: string) {
  if (!Array.isArray(value) || value.length === 0) {
    return createDefaultCriteria(`The outcome must address: ${shortTitle(instruction)}`);
  }

  return value.map((criterion, index) => {
    if (typeof criterion === "string") {
      return {
        id: createId("crit"),
        type: "model_judge",
        description: criterion,
        required: true,
      };
    }

    if (isRecord(criterion)) {
      const type = normalizeCriterionType(getRecordValue(criterion, "type"));
      const normalized = {
        id: asString(getRecordValue(criterion, "id")) ?? createId("crit"),
        type,
        description:
          asString(getRecordValue(criterion, "description", "message", "content", "summary")) ??
          `Criterion ${index + 1}`,
        required: normalizeBoolean(getRecordValue(criterion, "required"), true),
      };
      const toolName = asString(getRecordValue(criterion, "toolName", "tool_name"));
      return type === "tool_observation" && toolName ? { ...normalized, toolName } : normalized;
    }

    return criterion;
  });
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = asString(value)?.toLowerCase();
  if (normalized === "true" || normalized === "passed" || normalized === "pass" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "failed" || normalized === "fail" || normalized === "no") {
    return false;
  }

  return fallback;
}

function latestUserInput(context: Pick<LlmContext, "state">): string {
  for (let index = context.state.messages.length - 1; index >= 0; index -= 1) {
    const message = context.state.messages[index];
    if (message.role === "user") {
      return message.content;
    }
  }

  return context.state.input;
}

function normalizeRoutingOutput(
  value: unknown,
  context: Extract<LlmContext, { phase: "route" }>,
): TaskRoutingDecision {
  const raw = unwrapRecord(value, "routingDecision");
  if (!isRecord(raw)) {
    throw validationError("route", "Expected a routing decision object.");
  }

  const routeValue = asString(getRecordValue(raw, "route"))?.toLowerCase();
  const route = routeValue === "direct" || routeValue === "task" || routeValue === "thread"
    ? routeValue
    : undefined;
  if (!route) {
    throw validationError("route", "Expected route output to include route.");
  }
  const message =
    asString(getRecordValue(raw, "message")) ??
    asString(getRecordValue(raw, "answer")) ??
    asString(getRecordValue(raw, "response")) ??
    (route === "direct" ? latestUserInput(context) : "Creating a task for this request.");
  const rawThread = getRecordValue(raw, "thread");
  const thread = isRecord(rawThread)
    ? {
        prompt: asString(getRecordValue(rawThread, "prompt", "input")) ?? latestUserInput(context),
        task: asString(getRecordValue(rawThread, "task", "instruction")) ?? message,
        goal: asString(getRecordValue(rawThread, "goal", "acceptanceGoal", "acceptance_goal")) ?? message,
      }
    : undefined;

  try {
    return Validators.taskRoutingDecision.Parse({
      route,
      message,
      ...(route === "thread" && thread ? { thread } : {}),
    });
  } catch (error) {
    throw validationError("route", error);
  }
}

function normalizeTaskOutput(value: unknown, context: Extract<LlmContext, { phase: "plan" }>): Task {
  const raw = unwrapRecord(value, "task");
  if (!isRecord(raw)) {
    throw validationError("plan", "Expected an object containing a task.");
  }

  const instruction =
    asString(getRecordValue(raw, "instruction")) ??
    asString(getRecordValue(raw, "description")) ??
    asString(getRecordValue(raw, "message")) ??
    context.state.task ??
    latestUserInput(context);
  const defaultSkillIds = context.state.skills.map((skill) => skill.id);
  const normalized = {
    ...raw,
    id: asString(getRecordValue(raw, "id")) ?? createId("task"),
    title: asString(getRecordValue(raw, "title")) ?? asString(getRecordValue(raw, "name")) ?? shortTitle(instruction),
    instruction,
    acceptanceCriteria: normalizeAcceptanceCriteria(
      getRecordValue(raw, "acceptanceCriteria"),
      context.state.goal ?? instruction,
    ),
    toolNames: normalizeStringArray(getRecordValue(raw, "toolNames", "tools"), []),
    skillIds: normalizeStringArray(getRecordValue(raw, "skillIds", "skills"), defaultSkillIds),
    status: asString(getRecordValue(raw, "status")) ?? "pending",
    attempts: asNumber(getRecordValue(raw, "attempts")) ?? 0,
  };

  try {
    return Validators.task.Parse(normalized);
  } catch (error) {
    throw validationError("plan", error);
  }
}

function normalizeExecuteOutput(value: unknown): { message?: string; toolCalls: ToolCall[] } {
  const raw = unwrapRecord(value, "executeOutput", "executeResult", "executionResult");
  if (!isRecord(raw)) {
    throw validationError("execute", "Expected an execute output object.");
  }

  const toolCallsValue = getRecordValue(raw, "toolCalls", "tool_calls", "toolCall");
  if (!Array.isArray(toolCallsValue)) {
    throw validationError("execute", "Expected execute output to include a toolCalls array.");
  }

  const rawToolCalls = toolCallsValue;
  const toolCalls = rawToolCalls.map((toolCall) => {
    if (!isRecord(toolCall)) {
      throw validationError("execute", "Each tool call must be an object.");
    }

    try {
      return Validators.toolCall.Parse({
        id:
          asString(getRecordValue(toolCall, "id")) ??
          asString(getRecordValue(toolCall, "toolCallId", "tool_call_id")) ??
          createId("call"),
        name: asString(getRecordValue(toolCall, "name", "toolName", "tool_name")),
        args: getRecordValue(toolCall, "args", "arguments") ?? {},
      });
    } catch (error) {
      throw validationError("execute", error);
    }
  });

  const message = asString(getRecordValue(raw, "message"));
  return {
    ...(message ? { message } : {}),
    toolCalls,
  };
}

function normalizeVerificationOutput(
  value: unknown,
  _context: Extract<LlmContext, { phase: "verify" }>,
): VerificationResult {
  const raw = value;
  if (!isRecord(raw)) {
    throw validationError("verify", "Expected a verify judgement object.");
  }

  if (raw.task !== undefined || raw.toolCalls !== undefined || raw.tool_calls !== undefined) {
    throw validationError("verify", "Expected a verify judgement object, received another phase output.");
  }

  if (typeof raw.passed !== "boolean") {
    throw validationError("verify", "Expected verify output to include boolean passed.");
  }

  const passed = raw.passed;
  const message = asString(raw.message) ?? (passed ? "Task passed." : "Task failed.");

  try {
    return Validators.verificationResult.Parse({
      passed,
      message,
    });
  } catch (error) {
    throw validationError("verify", error);
  }
}

export function createOpenAICompatibleStream(config: OpenAICompatibleConfig): StreamFn {
  const normalizedConfig = {
    ...config,
    baseUrl: normalizeBaseUrl(config.baseUrl),
  };

  return async function* openAICompatibleStream(model, context, options): AsyncIterable<ModelStreamEvent> {
    const prompt = buildOpenAICompatiblePrompt({ context, tools: normalizedConfig.tools });
    const requestUsage = summarizeRequestUsage(prompt.messages);
    const requestBody = buildChatCompletionBody(normalizedConfig, prompt.messages);
    yield {
      type: "prompt_message",
      phase: context.phase,
      message: prompt.phasePromptMessage,
    };

    const result = await callOpenAICompatibleChatCompletion(
      normalizedConfig,
      prompt.messages,
      options,
      requestBody,
    );
    yield {
      type: "model_requested",
      phase: context.phase,
      model,
      usage: {
        ...requestUsage,
        ...summarizeResponseUsage(result),
      },
    };

    const value = extractJsonObject(result.content);

    if (context.phase === "route") {
      const decision = normalizeRoutingOutput(value, context);
      const output: LlmPhaseOutputMap["route"] = {
        ...decision,
        text: decision.message,
      };
      yield {
        type: "phase_output",
        phase: "route",
        output,
      };
      yield { type: "done" };
      return;
    }

    if (context.phase === "plan") {
      const task = normalizeTaskOutput(value, context);
      const output: LlmPhaseOutputMap["plan"] = {
        task,
        text: result.content,
      };
      yield {
        type: "text_delta",
        text: result.content,
      };
      yield {
        type: "phase_output",
        phase: "plan",
        output,
      };
      yield { type: "done" };
      return;
    }

    if (context.phase === "execute") {
      const output = normalizeExecuteOutput(value);
      const phaseOutput: LlmPhaseOutputMap["execute"] = {
        text: result.content,
        toolCalls: output.toolCalls,
      };
      yield {
        type: "text_delta",
        text: result.content,
      };
      yield {
        type: "phase_output",
        phase: "execute",
        output: phaseOutput,
      };
      yield { type: "done" };
      return;
    }

    const verification = normalizeVerificationOutput(value, context);
    const output: LlmPhaseOutputMap["verify"] = verification;
    yield {
      type: "text_delta",
      text: result.content,
    };
    yield {
      type: "phase_output",
      phase: "verify",
      output,
    };
    yield { type: "done" };
  };
}
