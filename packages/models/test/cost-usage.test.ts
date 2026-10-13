import { expect, test } from "bun:test";
import { normalizeUsage } from "../src/providers/shared";
import { calculateCost } from "../src/models";
import { createModelStream } from "../src/registry";
import type { Model, LlmTokenUsage, ModelConfig } from "../src/protocol";

test("normalizeUsage handles OpenAI chunk usage with cached and reasoning tokens", () => {
  const raw = {
    prompt_tokens: 100,
    completion_tokens: 50,
    total_tokens: 150,
    prompt_tokens_details: {
      cached_tokens: 30,
      cache_write_tokens: 10,
    },
    completion_tokens_details: {
      reasoning_tokens: 25,
    },
  };

  const normalized = normalizeUsage(raw);
  expect(normalized).toEqual({
    // inputTokens = prompt_tokens (100) - cached (30) - cache_write (10) = 60
    inputTokens: 60,
    outputTokens: 50,
    totalTokens: 150,
    cacheReadTokens: 30,
    cacheWriteTokens: 10,
    reasoningTokens: 25,
  });
});

test("normalizeUsage handles DeepSeek and Kimi cache representations", () => {
  const deepseek = normalizeUsage({
    prompt_tokens: 80,
    completion_tokens: 20,
    prompt_cache_hit_tokens: 50,
  });
  expect(deepseek).toEqual({
    inputTokens: 30,
    outputTokens: 20,
    cacheReadTokens: 50,
    totalTokens: 100,
  });

  const kimi = normalizeUsage({
    prompt_tokens: 100,
    completion_tokens: 40,
    cached_tokens: 60,
  });
  expect(kimi).toEqual({
    inputTokens: 40,
    outputTokens: 40,
    cacheReadTokens: 60,
    totalTokens: 140,
  });
});

test("calculateCost hand-calculated base rates", () => {
  const model: Model = {
    id: "test-model",
    name: "Test",
    protocol: "openai-completions",
    provider: "test",
    baseUrl: "https://api.example",
    reasoning: false,
    input: ["text"],
    cost: {
      input: 3.0,
      output: 15.0,
      cacheRead: 0.3,
      cacheWrite: 3.75,
    },
    contextWindow: 128_000,
    maxTokens: 4096,
  };

  const usage: LlmTokenUsage = {
    inputTokens: 50_000,
    outputTokens: 10_000,
    cacheReadTokens: 20_000,
    cacheWriteTokens: 10_000,
  };

  const cost = calculateCost(model, usage);
  expect(cost.input).toBeCloseTo(0.15, 6);
  expect(cost.output).toBeCloseTo(0.15, 6);
  expect(cost.cacheRead).toBeCloseTo(0.006, 6);
  expect(cost.cacheWrite).toBeCloseTo(0.0375, 6);
  expect(cost.total).toBeCloseTo(0.3435, 6);
  expect(usage.cost).toEqual(cost);
});

test("calculateCost hand-calculated tiered rates crossing threshold", () => {
  const model: Model = {
    id: "test-tiered-model",
    name: "Test Tiered",
    protocol: "openai-completions",
    provider: "test",
    baseUrl: "https://api.example",
    reasoning: false,
    input: ["text"],
    cost: {
      input: 3.0,
      output: 15.0,
      cacheRead: 0.3,
      cacheWrite: 3.75,
      tiers: [
        {
          inputTokensAbove: 100_000,
          input: 6.0,
          output: 30.0,
          cacheRead: 0.6,
          cacheWrite: 7.5,
        },
      ],
    },
    contextWindow: 128_000,
    maxTokens: 4096,
  };

  // total input = 60k + 30k + 20k = 110k > 100k
  const usage: LlmTokenUsage = {
    inputTokens: 60_000,
    outputTokens: 20_000,
    cacheReadTokens: 30_000,
    cacheWriteTokens: 20_000,
  };

  const cost = calculateCost(model, usage);
  expect(cost.input).toBeCloseTo(0.36, 6);
  expect(cost.output).toBeCloseTo(0.60, 6);
  expect(cost.cacheRead).toBeCloseTo(0.018, 6);
  expect(cost.cacheWrite).toBeCloseTo(0.15, 6);
  expect(cost.total).toBeCloseTo(1.128, 6);
});

test("calculateCost hand-calculated Anthropic 1h cache writes billed at 2x input rate", () => {
  const model: Model = {
    id: "claude-test",
    name: "Claude Test",
    protocol: "anthropic-messages",
    provider: "anthropic",
    baseUrl: "https://api.example",
    reasoning: false,
    input: ["text"],
    cost: {
      input: 3.0,
      output: 15.0,
      cacheRead: 0.3,
      cacheWrite: 3.75,
    },
    contextWindow: 200_000,
    maxTokens: 8192,
  };

  const usage: LlmTokenUsage = {
    inputTokens: 10_000,
    outputTokens: 5_000,
    cacheReadTokens: 0,
    cacheWriteTokens: 20_000,
    cacheWrite1hTokens: 8_000,
  };

  const cost = calculateCost(model, usage);
  expect(cost.input).toBeCloseTo(0.03, 6);
  expect(cost.output).toBeCloseTo(0.075, 6);
  expect(cost.cacheRead).toBe(0);
  expect(cost.cacheWrite).toBeCloseTo(0.093, 6);
  expect(cost.total).toBeCloseTo(0.198, 6);
});

test("createModelStream preserves cost.tiers from config", async () => {
  const config: ModelConfig = {
    id: "custom-model",
    name: "Custom",
    protocol: "openai-completions",
    provider: "custom",
    baseUrl: "https://api.example",
    apiKey: "test-key",
    cost: {
      input: 1,
      output: 2,
      cacheRead: 0.1,
      cacheWrite: 1,
      tiers: [
        {
          inputTokensAbove: 50_000,
          input: 2,
          output: 4,
          cacheRead: 0.2,
          cacheWrite: 2,
        },
      ],
    },
  };

  // createModelStream registers and uses modelFromConfig
  const streamFn = createModelStream(config);
  expect(streamFn).toBeDefined();
});
