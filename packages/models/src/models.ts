import type { Model, Provider, LlmTokenUsage, ModelCostRates } from "./protocol";
import { ZERO_COST } from "./protocol";

// ---------------------------------------------------------------------------
// Model registry
// ---------------------------------------------------------------------------

const modelRegistry = new Map<string, Map<string, Model>>();

/**
 * Register a model in the registry. Models are keyed by (provider, id).
 */
export function registerModel(model: Model): void {
  let providerModels = modelRegistry.get(model.provider);
  if (!providerModels) {
    providerModels = new Map();
    modelRegistry.set(model.provider, providerModels);
  }
  providerModels.set(model.id, model);
}

/**
 * Look up a model by provider and model id.
 */
export function getModel(provider: string, modelId: string): Model | undefined {
  return modelRegistry.get(provider)?.get(modelId);
}

/**
 * Look up a model by a combined "provider/model" string (e.g. "anthropic/claude-sonnet-4-20250514").
 */
export function resolveModel(ref: string): Model | undefined {
  const slashIndex = ref.indexOf("/");
  if (slashIndex === -1) {
    // Try all providers
    for (const models of modelRegistry.values()) {
      const found = models.get(ref);
      if (found) return found;
    }
    return undefined;
  }
  const provider = ref.slice(0, slashIndex);
  const modelId = ref.slice(slashIndex + 1);
  return getModel(provider, modelId);
}

/**
 * Get all registered provider names.
 */
export function getProviders(): Provider[] {
  return [...modelRegistry.keys()];
}

/**
 * Get all models for a given provider.
 */
export function getModels(provider: string): Model[] {
  const models = modelRegistry.get(provider);
  return models ? [...models.values()] : [];
}

/**
 * Get all registered models across all providers.
 */
export function getAllModels(): Model[] {
  const result: Model[] = [];
  for (const models of modelRegistry.values()) {
    result.push(...models.values());
  }
  return result;
}

/**
 * Clear all registered models. Useful for testing.
 */
export function clearModels(): void {
  modelRegistry.clear();
}

/**
 * Unregister all models for a given provider. Returns the number of models removed.
 */
export function unregisterProviderModels(provider: string): number {
  const models = modelRegistry.get(provider);
  if (!models) return 0;
  const count = models.size;
  modelRegistry.delete(provider);
  return count;
}

// ---------------------------------------------------------------------------
// Cost calculation
// ---------------------------------------------------------------------------

export function calculateCost(model: Model, usage: LlmTokenUsage): {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
} {
  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  const cacheRead = usage.cacheReadTokens ?? 0;
  const cacheWrite = usage.cacheWriteTokens ?? 0;
  const cacheWrite1h = usage.cacheWrite1hTokens ?? 0;

  const totalInputTokens = input + cacheRead + cacheWrite;
  let rates: ModelCostRates = model.cost ?? ZERO_COST;
  let matchedThreshold = -1;
  for (const tier of model.cost?.tiers ?? []) {
    if (totalInputTokens > tier.inputTokensAbove && tier.inputTokensAbove > matchedThreshold) {
      rates = tier;
      matchedThreshold = tier.inputTokensAbove;
    }
  }

  // Anthropic charges 2x base input for 1h cache writes.
  const longWrite = cacheWrite1h;
  const shortWrite = Math.max(0, cacheWrite - longWrite);
  const costInput = (rates.input / 1_000_000) * input;
  const costOutput = (rates.output / 1_000_000) * output;
  const costCacheRead = (rates.cacheRead / 1_000_000) * cacheRead;
  const costCacheWrite = (rates.cacheWrite * shortWrite + rates.input * 2 * longWrite) / 1_000_000;
  const costTotal = costInput + costOutput + costCacheRead + costCacheWrite;

  const cost = {
    input: costInput,
    output: costOutput,
    cacheRead: costCacheRead,
    cacheWrite: costCacheWrite,
    total: costTotal,
  };
  usage.cost = cost;
  return cost;
}
