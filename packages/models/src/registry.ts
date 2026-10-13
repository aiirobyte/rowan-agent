import type {
  Protocol,
  Model,
  ModelConfig,
  ModelRef,
  LlmRequest,
  LlmStreamEvent,
  ProviderCallContext,
  ProviderStreamFn,
  StreamFn,
  ModelCost,
} from "./protocol";
import { createProviderCallContext, ZERO_COST } from "./protocol";
import { getModel, resolveModel } from "./models";
import { MODELS } from "./models.generated";
import { streamOpenAICompletions } from "./providers/openai-completions";
import { streamOpenAIResponses } from "./providers/openai-responses";
import { streamAnthropic } from "./providers/anthropic";

// ---------------------------------------------------------------------------
// API Provider Registry (dispatches by model.protocol, not model.provider)
// ---------------------------------------------------------------------------

export interface ApiProvider {
  protocol: Protocol;
  stream: ProviderStreamFn;
}

export function parseModelRef(input?: string): ModelRef | undefined {
  if (!input) return undefined;
  const slashIndex = input.indexOf("/");
  if (slashIndex === -1) return { provider: "*", id: input };
  return {
    provider: input.slice(0, slashIndex),
    id: input.slice(slashIndex + 1),
  };
}

const apiProviderRegistry = new Map<string, ApiProvider>();

/**
 * Register a provider for a given API protocol.
 * When a model with `protocol === provider.protocol` is used, this provider handles it.
 */
export function registerApiProvider(provider: ApiProvider): void {
  apiProviderRegistry.set(provider.protocol, provider);
}

/**
 * Look up a registered API provider by protocol name.
 */
export function getApiProvider(protocol: Protocol): ApiProvider | undefined {
  return apiProviderRegistry.get(protocol);
}

/**
 * List all registered API protocol names.
 */
export function listApiProviders(): Protocol[] {
  return [...apiProviderRegistry.keys()];
}

/**
 * Clear all registered API providers.
 */
export function clearApiProviders(): void {
  apiProviderRegistry.clear();
}

/**
 * Unregister an API provider by protocol name.
 * Returns true if a provider was removed.
 */
export function unregisterApiProvider(protocol: Protocol): boolean {
  return apiProviderRegistry.delete(protocol);
}

// ---------------------------------------------------------------------------
// Built-in provider registration
// ---------------------------------------------------------------------------

/**
 * Register all built-in API providers.
 * Each provider resolves its config from the Model descriptor and environment.
 */
export function registerBuiltInApiProviders(): void {
  registerApiProvider({ protocol: "openai-completions", stream: streamOpenAICompletions });
  registerApiProvider({ protocol: "openai-responses", stream: streamOpenAIResponses });
  registerApiProvider({ protocol: "anthropic-messages", stream: streamAnthropic });
}

// ---------------------------------------------------------------------------
// Top-level dispatch
// ---------------------------------------------------------------------------

/**
 * Resolve the API provider for a model and stream the request.
 * This is the main entry point for model-based dispatch.
 */
export function stream(model: Model, request: LlmRequest, ctx?: ProviderCallContext | Partial<ProviderCallContext>): AsyncIterable<LlmStreamEvent> {
  const provider = apiProviderRegistry.get(model.protocol);
  if (!provider) {
    throw new Error(
      `No API provider registered for protocol "${model.protocol}". ` +
      `Registered: ${[...apiProviderRegistry.keys()].join(", ") || "(none)"}. ` +
      `Call registerBuiltInApiProviders() or registerApiProvider() first.`,
    );
  }
  const callContext: ProviderCallContext = ctx && "signal" in ctx && "run" in ctx && "interact" in ctx && "tools" in ctx
    ? ctx as ProviderCallContext
    : createProviderCallContext(ctx);
  return provider.stream(model, request, callContext);
}

/**
 * Convenience: resolve model from a "provider/model" string or ModelRef,
 * then stream.
 */
export function streamByRef(
  ref: string | { provider: string; id: string },
  request: Omit<LlmRequest, "model">,
  ctx?: ProviderCallContext | Partial<ProviderCallContext>,
): AsyncIterable<LlmStreamEvent> {
  const model = typeof ref === "string"
    ? resolveModel(ref)
    : getModel(ref.provider, ref.id);

  if (!model) {
    const key = typeof ref === "string" ? ref : `${ref.provider}/${ref.id}`;
    throw new Error(`Model not found: "${key}". Register it with registerModel() first.`);
  }

  return stream(model, { ...request, model: { provider: model.provider, id: model.id } }, ctx);
}

function parseHostname(urlStr?: string): string | undefined {
  if (!urlStr) return undefined;
  try {
    const parsed = new URL(urlStr);
    return parsed.hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function findCatalogModel(
  config: ModelConfig,
  catalog: Record<string, Record<string, Model>>,
): Model | undefined {
  const byProvider = catalog[config.provider]?.[config.id];
  if (byProvider) return byProvider;
  // A host-named provider (e.g. "my-deepseek") is matched by its baseUrl host.
  const host = parseHostname(config.baseUrl);
  if (!host) return undefined;
  for (const providerModels of Object.values(catalog)) {
    const model = providerModels[config.id];
    if (model && parseHostname(model.baseUrl) === host) return model;
  }
  return undefined;
}

/**
 * Resolves model cost for a host configuration, like pi's modelOverrides:
 * the catalog entry (same provider and id, else same baseUrl host and id)
 * gives the rates, and each rate the host supplies replaces its own field.
 * A local gateway matches no catalog host, so only host rates apply.
 */
export function resolveConfigCost(
  config: ModelConfig,
  catalog: Record<string, Record<string, Model>> = MODELS,
): ModelCost {
  const base = findCatalogModel(config, catalog)?.cost ?? ZERO_COST;
  const host = config.cost ?? {};
  const tiers = host.tiers ?? base.tiers;
  return {
    input: host.input ?? base.input,
    output: host.output ?? base.output,
    cacheRead: host.cacheRead ?? base.cacheRead,
    cacheWrite: host.cacheWrite ?? base.cacheWrite,
    ...(tiers ? { tiers } : {}),
  };
}

function modelFromConfig(config: ModelConfig): Model {
  return {
    id: config.id,
    name: config.name,
    protocol: config.protocol,
    provider: config.provider,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    reasoning: config.reasoning ?? false,
    ...(config.thinkingLevel !== undefined ? { thinkingLevel: config.thinkingLevel } : {}),
    ...(config.thinkingLevels !== undefined ? { thinkingLevels: config.thinkingLevels } : {}),
    input: config.input ?? ["text"],
    cost: resolveConfigCost(config),
    contextWindow: config.contextWindow ?? 128_000,
    maxTokens: config.maxTokens ?? 4096,
    ...(config.headers ? { headers: config.headers } : {}),
    ...(config.timeoutMs !== undefined ? { timeoutMs: config.timeoutMs } : {}),
    ...(config.maxRetries !== undefined ? { maxRetries: config.maxRetries } : {}),
    ...(config.retryDelayMs !== undefined ? { retryDelayMs: config.retryDelayMs } : {}),
  };
}

export function createModelStream(config?: ModelConfig): StreamFn {
  if (config || apiProviderRegistry.size === 0) registerBuiltInApiProviders();
  const configuredModel = config ? modelFromConfig(config) : undefined;

  return async function* modelStream(request, ctx) {
    if (
      configuredModel
      && (configuredModel.provider !== request.model.provider || configuredModel.id !== request.model.id)
    ) {
      throw new Error(
        `Model stream is configured for "${configuredModel.provider}/${configuredModel.id}", `
        + `not "${request.model.provider}/${request.model.id}".`,
      );
    }

    const model = configuredModel
      ?? getModel(request.model.provider, request.model.id)
      ?? resolveModel(request.model.id);

    if (model) {
      yield* stream(model, request, ctx);
      return;
    }

    throw new Error(
      `No provider for "${request.model.provider}/${request.model.id}". ` +
      "Register the Model before starting the Agent Runtime.",
    );
  };
}
