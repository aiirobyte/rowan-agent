import { createDefaultCriteria } from "@rowan-agent/agent";
import { buildOpenAICompatiblePrompt, type ChatMessage } from "@rowan-agent/context";
import { extractJsonObject } from "./json-extract";
import type {
  LlmContext,
  ModelCallUsage,
  ModelStreamEvent,
  StreamFn,
  StreamOptions,
  Task,
  TaskRoutingDecision,
  Tool,
  ToolCall,
  VerificationResult,
} from "@rowan-agent/agent";
import { createId, Validators } from "@rowan-agent/agent";

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

type ExecuteModelOutput = {
  message?: string;
  toolCalls?: unknown[];
  tool_calls?: unknown[];
  toolCall?: unknown;
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

export async function callOpenAICompatibleChatCompletion(
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
    const response = await fetchImpl(`${normalizeBaseUrl(config.baseUrl)}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal,
    });

    if (!response.ok) {
      throw normalizeHttpError(response, await readErrorBody(response));
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
      const name = asString(item.name) ?? asString(item.id);
      return name ? [name] : [];
    }
    return [];
  });
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
      return {
        id: createId("crit"),
        type: "model_judge",
        description: `Criterion ${index + 1}`,
        required: true,
        ...criterion,
      };
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

function normalizeRoutingOutput(
  value: unknown,
  context: Extract<LlmContext, { phase: "route" }>,
): TaskRoutingDecision {
  const raw = isRecord(value) && isRecord(value.routingDecision) ? value.routingDecision : value;
  if (!isRecord(raw)) {
    throw validationError("route", "Expected a routing decision object.");
  }

  const needsTask = normalizeBoolean(
    raw.needsTask ?? raw.needs_task ?? raw.taskRequired ?? raw.requiresTask ?? raw.shouldCreateTask,
    true,
  );
  const message =
    asString(raw.message) ??
    asString(raw.answer) ??
    asString(raw.response) ??
    (needsTask ? "Creating a task for this request." : context.session.userInput);

  try {
    return Validators.taskRoutingDecision.Parse({
      needsTask,
      message,
    });
  } catch (error) {
    throw validationError("route", error);
  }
}

function normalizeEvidence(value: unknown): unknown[] {
  if (typeof value === "string" && value.trim().length > 0) {
    return [
      {
        id: createId("ev"),
        kind: "model_observation",
        summary: value.trim(),
      },
    ];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((evidence, index) => {
    if (typeof evidence === "string") {
      return {
        id: createId("ev"),
        kind: "model_observation",
        summary: evidence,
      };
    }

    if (isRecord(evidence)) {
      return {
        id: asString(evidence.id) ?? createId("ev"),
        kind: asString(evidence.kind) ?? asString(evidence.type) ?? "model_observation",
        summary:
          asString(evidence.summary) ??
          asString(evidence.message) ??
          asString(evidence.content) ??
          `Evidence ${index + 1}`,
        ...(evidence.data !== undefined ? { data: evidence.data } : { data: evidence }),
      };
    }

    return {
      id: createId("ev"),
      kind: "model_observation",
      summary: `Evidence ${index + 1}`,
      data: evidence,
    };
  });
}

function normalizeTaskOutput(value: unknown, context: Extract<LlmContext, { phase: "plan" }>): Task {
  const raw = isRecord(value) && isRecord(value.task) ? value.task : value;
  if (!isRecord(raw)) {
    throw validationError("plan", "Expected an object containing a task.");
  }

  const instruction =
    asString(raw.instruction) ??
    asString(raw.description) ??
    asString(raw.message) ??
    context.session.userInput;
  const defaultSkillIds = context.session.skills.map((skill) => skill.id);
  const normalized = {
    ...raw,
    id: asString(raw.id) ?? createId("task"),
    title: asString(raw.title) ?? asString(raw.name) ?? shortTitle(instruction),
    instruction,
    acceptanceCriteria: normalizeAcceptanceCriteria(raw.acceptanceCriteria, instruction),
    toolNames: normalizeStringArray(raw.toolNames ?? raw.tools, []),
    skillIds: normalizeStringArray(raw.skillIds ?? raw.skills, defaultSkillIds),
    status: asString(raw.status) ?? "pending",
    attempts: typeof raw.attempts === "number" ? raw.attempts : 0,
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
  const rawToolCalls = Array.isArray(output.toolCalls)
    ? output.toolCalls
    : Array.isArray(output.tool_calls)
      ? output.tool_calls
      : isRecord(output.toolCall)
        ? [output.toolCall]
        : [];
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

function normalizeVerificationOutput(
  value: unknown,
  context: Extract<LlmContext, { phase: "verify" }>,
): VerificationResult {
  const raw = isRecord(value) && isRecord(value.verificationResult) ? value.verificationResult : value;
  if (!isRecord(raw)) {
    throw validationError("verify", "Expected a verification result object.");
  }

  const passed = normalizeBoolean(raw.passed ?? raw.status, false);
  const defaultFailedCriteria = passed
    ? []
    : context.criteria.filter((criterion) => criterion.required).map((criterion) => criterion.id);

  try {
    return Validators.verificationResult.Parse({
      ...raw,
      passed,
      message:
        asString(raw.message) ??
        asString(raw.reason) ??
        asString(raw.summary) ??
        (passed ? "Task passed." : "Task failed."),
      evidence: normalizeEvidence(raw.evidence),
      failedCriteria: normalizeStringArray(raw.failedCriteria ?? raw.failed_criteria, defaultFailedCriteria),
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

    yield { type: "trace_messages", messages: prompt.traceMessages };

    const result = await callOpenAICompatibleChatCompletion(
      normalizedConfig,
      prompt.messages,
      options,
      requestBody,
    );
    yield {
      type: "model_call",
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
      yield {
        type: "structured_output",
        content: decision,
      };
      yield { type: "done" };
      return;
    }

    if (context.phase === "plan") {
      const task = normalizeTaskOutput(value, context);
      yield {
        type: "text_delta",
        text: result.content,
      };
      yield {
        type: "structured_output",
        content: task,
      };
      yield { type: "done" };
      return;
    }

    if (context.phase === "execute") {
      const output = normalizeExecuteOutput(value);
      yield {
        type: "text_delta",
        text: result.content,
      };
      for (const toolCall of output.toolCalls) {
        yield { type: "tool_call", toolCall };
      }
      yield { type: "done" };
      return;
    }

    const verification = normalizeVerificationOutput(value, context);
    yield {
      type: "text_delta",
      text: result.content,
    };
    yield {
      type: "structured_output",
      content: verification,
    };
    yield { type: "done" };
  };
}
