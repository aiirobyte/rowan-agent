import { expect, test } from "bun:test";
import { transformPiCatalog } from "../scripts/import-pi-catalog";
import { getModel } from "../src/models";
import { MODELS } from "../src/models.generated";
import { resolveConfigCost } from "../src/registry";
import type { ModelConfig } from "../src/protocol";

test("transformPiCatalog pure transform over in-test fixtures (offline)", () => {
  const fixture1 = {
    "openai-completions": {
      "chat:model-a": {
        type: "chat",
        id: "model-a",
        name: "Model A",
        api: "openai-completions",
        provider: "provider-1",
        baseUrl: "https://api.provider-1.example/v1",
        reasoning: false,
        input: ["text"],
        cost: {
          input: 1.5,
          output: 6.0,
          cacheRead: 0.15,
          cacheWrite: 1.0,
          tiers: [
            {
              inputTokensAbove: 50_000,
              input: 3.0,
              output: 12.0,
              cacheRead: 0.3,
              cacheWrite: 2.0,
            },
          ],
        },
        contextWindow: 128_000,
        maxTokens: 8192,
        compat: { someFlag: true },
        thinkingLevelMap: { high: "high" },
      },
      "classifier:non-chat-item": {
        type: "classifier",
        id: "non-chat-item",
        name: "Non Chat Classifier",
        api: "openai-completions",
        baseUrl: "https://api.provider-1.example/v1",
      },
    },
    "unsupported-custom-protocol": {
      "chat:unsupported-item": {
        type: "chat",
        id: "unsupported-item",
        name: "Unsupported Item",
        api: "unsupported-custom-protocol",
        baseUrl: "https://api.provider-1.example/v1",
      },
    },
  };

  const fixture2 = {
    "anthropic-messages": {
      "chat:model-b": {
        type: "chat",
        id: "model-b",
        name: "Model B",
        api: "anthropic-messages",
        provider: "provider-2",
        baseUrl: "https://api.provider-2.example",
        reasoning: true,
        input: ["text", "image"],
        cost: {
          input: 3.0,
          output: 15.0,
          cacheRead: 0.3,
          cacheWrite: 3.75,
        },
        contextWindow: 200_000,
        maxTokens: 16_000,
      },
    },
  };

  const catalog = transformPiCatalog({
    "provider-2.json": fixture2,
    "provider-1.json": fixture1,
  });

  // Deterministically sorted: provider-1 before provider-2
  expect(Object.keys(catalog)).toEqual(["provider-1", "provider-2"]);
  expect(Object.keys(catalog["provider-1"])).toEqual(["model-a"]);
  expect(Object.keys(catalog["provider-2"])).toEqual(["model-b"]);

  // Model-a structure
  expect(catalog["provider-1"]["model-a"]).toEqual({
    id: "model-a",
    name: "Model A",
    protocol: "openai-completions",
    provider: "provider-1",
    baseUrl: "https://api.provider-1.example/v1",
    reasoning: false,
    input: ["text"],
    cost: {
      input: 1.5,
      output: 6.0,
      cacheRead: 0.15,
      cacheWrite: 1.0,
      tiers: [
        {
          inputTokensAbove: 50_000,
          input: 3.0,
          output: 12.0,
          cacheRead: 0.3,
          cacheWrite: 2.0,
        },
      ],
    },
    contextWindow: 128_000,
    maxTokens: 8192,
  });

  // Model-b structure
  expect(catalog["provider-2"]["model-b"]).toEqual({
    id: "model-b",
    name: "Model B",
    protocol: "anthropic-messages",
    provider: "provider-2",
    baseUrl: "https://api.provider-2.example",
    reasoning: true,
    input: ["text", "image"],
    cost: {
      input: 3.0,
      output: 15.0,
      cacheRead: 0.3,
      cacheWrite: 3.75,
    },
    contextWindow: 200_000,
    maxTokens: 16_000,
  });
});

test("Price fallback: by provider + id when host gives no cost", () => {
  const config: ModelConfig = {
    id: "deepseek-flash",
    provider: "deepseek",
    protocol: "openai-completions",
    baseUrl: "https://custom-proxy.example.com",
    apiKey: "test-key",
  };

  const cost = resolveConfigCost(config);
  expect(cost.input).toBe(0.3);
  expect(cost.output).toBe(1.2);
  expect(cost.cacheRead).toBe(0.006);
  expect(cost.cacheWrite).toBe(0);
});

test("Price fallback: by baseUrl host when provider is custom/unmatched", () => {
  const config: ModelConfig = {
    id: "deepseek-flash",
    provider: "mori-custom-proxy",
    protocol: "openai-completions",
    baseUrl: "https://api.deepseek.com/v1",
    apiKey: "test-key",
  };

  const cost = resolveConfigCost(config);
  expect(cost.input).toBe(0.3);
  expect(cost.output).toBe(1.2);
  expect(cost.cacheRead).toBe(0.006);
});

test("Price fallback: host-supplied cost always wins over catalog", () => {
  const config: ModelConfig = {
    id: "deepseek-flash",
    provider: "deepseek",
    protocol: "openai-completions",
    baseUrl: "https://api.deepseek.com",
    apiKey: "test-key",
    cost: {
      input: 99,
      output: 199,
      cacheRead: 9,
      cacheWrite: 19,
    },
  };

  const cost = resolveConfigCost(config);
  expect(cost.input).toBe(99);
  expect(cost.output).toBe(199);
  expect(cost.cacheRead).toBe(9);
  expect(cost.cacheWrite).toBe(19);
});

test("Price fallback: local gateway stays zero", () => {
  const config1: ModelConfig = {
    id: "deepseek-flash",
    provider: "local-proxy",
    protocol: "openai-completions",
    baseUrl: "http://127.0.0.1:11434/v1",
    apiKey: "test-key",
  };
  expect(resolveConfigCost(config1)).toEqual({
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
  });

  const config2: ModelConfig = {
    id: "deepseek-flash",
    provider: "local-proxy",
    protocol: "openai-completions",
    baseUrl: "http://localhost:8080",
    apiKey: "test-key",
  };
  expect(resolveConfigCost(config2)).toEqual({
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
  });
});

test("the built-in catalog prices but does not register models", () => {
  expect(MODELS.deepseek?.["deepseek-flash"]?.cost.input).toBe(0.3);
  expect(getModel("deepseek", "deepseek-flash")).toBeUndefined();
});

test("Price fallback: an all-zero host cost keeps the model free", () => {
  const cost = resolveConfigCost({
    id: "deepseek-flash",
    provider: "deepseek",
    protocol: "openai-completions",
    baseUrl: "https://api.deepseek.com",
    apiKey: "test-key",
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  });
  expect(cost.input).toBe(0);
  expect(cost.output).toBe(0);
});
