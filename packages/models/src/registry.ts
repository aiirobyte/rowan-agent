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

export function parseHostname(urlStr?: string): string | undefined {
  if (!urlStr) return undefined;
  try {
    const parsed = new URL(urlStr);
    return parsed.hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

export function isLocalGatewayHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "0.0.0.0" ||
    h === "::1" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local")
  );
}

function hasConfiguredCost(cost?: Partial<ModelCost>): boolean {
  if (!cost) return false;
  if ((cost.input ?? 0) > 0 || (cost.output ?? 0) > 0 || (cost.cacheRead ?? 0) > 0 || (cost.cacheWrite ?? 0) > 0) {
    return true;
  }
  if (cost.tiers && cost.tiers.length > 0) {
    return true;
  }
  return false;
}

/**
 * Resolves model cost for a host configuration.
 * A host-supplied cost always wins, even all zeros (a free model).
 * Without one:
 * 1. Checks catalog entry with matching provider and model id.
 * 2. Matches catalog provider by config baseUrl hostname and then model id.
 * Local gateways (127.0.0.1, localhost, etc.) match nothing and stay 0.
 */
export function resolveConfigCost(
  config: ModelConfig,
  catalog: Record<string, Record<string, Model>> = MODELS,
): ModelCost {
  if (config.cost) return { ...ZERO_COST, ...config.cost };

  // 1. Direct match by (provider, id)
  const byProvider = catalog[config.provider]?.[config.id];
  if (byProvider?.cost && hasConfiguredCost(byProvider.cost)) {
    return { ...ZERO_COST, ...byProvider.cost };
  }

  // 2. BaseUrl host match
  const configHost = parseHostname(config.baseUrl);
  if (configHost && !isLocalGatewayHost(configHost)) {
    for (const providerModels of Object.values(catalog)) {
      const matchesHost = Object.values(providerModels).some(
        (m) => parseHostname(m.baseUrl) === configHost,
      );
      if (matchesHost) {
        const matchedModel = providerModels[config.id];
        if (matchedModel?.cost && hasConfiguredCost(matchedModel.cost)) {
          return { ...ZERO_COST, ...matchedModel.cost };
        }
      }
    }
  }

  return ZERO_COST;
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
