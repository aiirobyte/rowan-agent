import type { Protocol, ApiStreamFn, Model, LlmModelRef, LlmRequest, LlmStreamEvent, LlmStreamOptions, StreamFn } from "./protocol";
import { getModel, resolveModel } from "./models";
import { streamOpenAICompletions } from "./providers/openai-completions";
import { streamOpenAIResponses } from "./providers/openai-responses";
import { streamAnthropic } from "./providers/anthropic";

// ---------------------------------------------------------------------------
// API Provider Registry (dispatches by model.protocol, not model.provider)
// ---------------------------------------------------------------------------

export interface ApiProvider {
  protocol: Protocol;
  stream: ApiStreamFn;
}

export function parseModelRef(input?: string): LlmModelRef | undefined {
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
export function stream(model: Model, request: LlmRequest, options: LlmStreamOptions): AsyncIterable<LlmStreamEvent> {
  const provider = apiProviderRegistry.get(model.protocol);
  if (!provider) {
    throw new Error(
      `No API provider registered for protocol "${model.protocol}". ` +
      `Registered: ${[...apiProviderRegistry.keys()].join(", ") || "(none)"}. ` +
      `Call registerBuiltInApiProviders() or registerApiProvider() first.`,
    );
  }
  return provider.stream(model, request, options);
}

/**
 * Convenience: resolve model from a "provider/model" string or LlmModelRef,
 * then stream.
 */
export function streamByRef(
  ref: string | { provider: string; id: string },
  request: Omit<LlmRequest, "model">,
  options: LlmStreamOptions = {},
): AsyncIterable<LlmStreamEvent> {
  const model = typeof ref === "string"
    ? resolveModel(ref)
    : getModel(ref.provider, ref.id);

  if (!model) {
    const key = typeof ref === "string" ? ref : `${ref.provider}/${ref.id}`;
    throw new Error(`Model not found: "${key}". Register it with registerModel() first.`);
  }

  return stream(model, { ...request, model: { provider: model.provider, id: model.id } }, options);
}

// ---------------------------------------------------------------------------
// Legacy provider factory (backward compat with CLI)
// ---------------------------------------------------------------------------

export type ProviderFactory = (model: { provider: string; id: string }) => StreamFn;

const legacyProviders = new Map<string, ProviderFactory>();

export function registerProvider(name: string, factory: ProviderFactory): void {
  legacyProviders.set(name, factory);
}

export function createModelStream(): StreamFn {
  // Auto-register built-in providers if none registered
  if (apiProviderRegistry.size === 0) {
    registerBuiltInApiProviders();
  }

  return async function* modelStream(request, options) {
    // Try to resolve a full Model from the registry
    const model = getModel(request.model.provider, request.model.id)
      ?? resolveModel(request.model.id);

    if (model) {
      yield* stream(model, request, options);
      return;
    }

    // Fallback: try legacy provider factory
    const factory = legacyProviders.get(request.model.provider);
    if (factory) {
      const streamFn = factory(request.model);
      yield* streamFn(request, options);
      return;
    }

    throw new Error(
      `No provider for "${request.model.provider}/${request.model.id}". ` +
      `Register a model with registerModel() or a provider with registerProvider().`,
    );
  };
}
