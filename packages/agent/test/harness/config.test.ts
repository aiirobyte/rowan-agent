import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadConfigFile,
  registerConfigModels,
  resolveDefaultModel,
  parseModelRef,
  interpolateEnvVars,
  type AgentConfigFile,
} from "../../src/harness/config";
import {
  type WorkspacePaths,
} from "../../src/harness/env";
import { getModel, clearModels } from "@rowan-agent/models";

function ws(dir: string): WorkspacePaths {
  return { mode: "source", cwd: dir, rowanDir: join(dir, ".rowan") };
}

// ---------------------------------------------------------------------------
// parseModelRef
// ---------------------------------------------------------------------------

test("parseModelRef returns undefined for empty input", () => {
  expect(parseModelRef()).toBeUndefined();
  expect(parseModelRef("")).toBeUndefined();
});

test("parseModelRef resolves bare model id as wildcard provider", () => {
  expect(parseModelRef("gpt-4.1")).toEqual({ provider: "*", id: "gpt-4.1" });
});

test("parseModelRef resolves provider/model", () => {
  expect(parseModelRef("anthropic/claude-sonnet-4-20250514")).toEqual({
    provider: "anthropic",
    id: "claude-sonnet-4-20250514",
  });
});

// ---------------------------------------------------------------------------
// interpolateEnvVars
// ---------------------------------------------------------------------------

test("interpolateEnvVars replaces ${VAR} with env value", () => {
  process.env._TEST_VAR = "resolved-value";
  try {
    expect(interpolateEnvVars("prefix-${_TEST_VAR}-suffix")).toBe("prefix-resolved-value-suffix");
  } finally {
    delete process.env._TEST_VAR;
  }
});

test("interpolateEnvVars replaces multiple vars", () => {
  process.env._A = "1";
  process.env._B = "2";
  try {
    expect(interpolateEnvVars("${_A}${_B}")).toBe("12");
  } finally {
    delete process.env._A;
    delete process.env._B;
  }
});

test("interpolateEnvVars throws on undefined var", () => {
  expect(() => interpolateEnvVars("${_UNDEFINED_VAR_}")).toThrow(
    'Environment variable "_UNDEFINED_VAR_" is not set',
  );
});

test("interpolateEnvVars throws on empty var", () => {
  process.env._EMPTY_VAR = "";
  try {
    expect(() => interpolateEnvVars("${_EMPTY_VAR}")).toThrow(
      'Environment variable "_EMPTY_VAR" is not set',
    );
  } finally {
    delete process.env._EMPTY_VAR;
  }
});

test("interpolateEnvVars returns unchanged string without vars", () => {
  expect(interpolateEnvVars("plain-string")).toBe("plain-string");
});

// ---------------------------------------------------------------------------
// loadConfigFile
// ---------------------------------------------------------------------------

test("loadConfigFile returns undefined for missing config file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rowan-config-missing-"));
  try {
    const result = await loadConfigFile(ws(dir));
    expect(result).toBeUndefined();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("loadConfigFile parses valid config.yaml", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rowan-config-valid-"));
  try {
    const rowanDir = join(dir, ".rowan");
    await mkdir(rowanDir, { recursive: true });
    await writeFile(join(rowanDir, "config.yaml"), `
model:
  provider: openai
  id: gpt-4.1
providers:
  - id: openai
    baseUrl: https://api.openai.com/v1
    apiKey: test-key
    protocol: openai-completions
    models:
      - id: gpt-4.1
        name: GPT-4.1
      - id: gpt-4.1-mini
`);

    const result = await loadConfigFile(ws(dir));
    expect(result).toBeDefined();
    expect(result!.model).toEqual({ provider: "openai", id: "gpt-4.1" });
    expect(result!.providers).toHaveLength(1);
    expect(result!.providers[0].id).toBe("openai");
    expect(result!.providers[0].apiKey).toBe("test-key");
    expect(result!.providers[0].protocol).toBe("openai-completions");
    expect(result!.providers[0].models).toHaveLength(2);
    expect(result!.providers[0].models[0].id).toBe("gpt-4.1");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("loadConfigFile interpolates ${VAR} in apiKey", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rowan-config-interpolate-"));
  process.env._TEST_API_KEY = "interpolated-key";
  try {
    const rowanDir = join(dir, ".rowan");
    await mkdir(rowanDir, { recursive: true });
    await writeFile(join(rowanDir, "config.yaml"), `
providers:
  - id: openai
    baseUrl: https://api.openai.com/v1
    apiKey: \${_TEST_API_KEY}
    protocol: openai-completions
    models:
      - id: gpt-4.1
`);

    const result = await loadConfigFile(ws(dir));
    expect(result!.providers[0].apiKey).toBe("interpolated-key");
  } finally {
    delete process.env._TEST_API_KEY;
    await rm(dir, { recursive: true, force: true });
  }
});

test("loadConfigFile throws on bad YAML", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rowan-config-bad-yaml-"));
  try {
    const rowanDir = join(dir, ".rowan");
    await mkdir(rowanDir, { recursive: true });
    await writeFile(join(rowanDir, "config.yaml"), "%%%not valid yaml%%%");

    await expect(loadConfigFile(ws(dir))).rejects.toThrow("Failed to parse");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("loadConfigFile throws on missing apiKey", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rowan-config-no-apikey-"));
  try {
    const rowanDir = join(dir, ".rowan");
    await mkdir(rowanDir, { recursive: true });
    await writeFile(join(rowanDir, "config.yaml"), `
providers:
  - id: openai
    baseUrl: https://api.openai.com/v1
    protocol: openai-completions
    models:
      - id: gpt-4.1
`);

    await expect(loadConfigFile(ws(dir))).rejects.toThrow("apiKey is required");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("loadConfigFile throws on missing providers array", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rowan-config-no-providers-"));
  try {
    const rowanDir = join(dir, ".rowan");
    await mkdir(rowanDir, { recursive: true });
    await writeFile(join(rowanDir, "config.yaml"), "key: value");

    await expect(loadConfigFile(ws(dir))).rejects.toThrow('"providers" array');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// resolveDefaultModel
// ---------------------------------------------------------------------------

test("resolveDefaultModel prefers top-level model: override", () => {
  const config: AgentConfigFile = {
    model: { provider: "top", id: "top-model" },
    providers: [
      {
        id: "p",
        baseUrl: "",
        apiKey: "",
        protocol: "openai-completions",
        models: [{ id: "first", primary: true }],
      },
    ],
  };
  const result = resolveDefaultModel(config);
  expect(result).toEqual({ provider: "top", id: "top-model" });
});

test("resolveDefaultModel uses primary model when no top-level model", () => {
  const config: AgentConfigFile = {
    providers: [
      {
        id: "p",
        baseUrl: "",
        apiKey: "",
        protocol: "openai-completions",
        models: [
          { id: "first" },
          { id: "second", primary: true },
        ],
      },
    ],
  };
  const result = resolveDefaultModel(config);
  expect(result).toEqual({ provider: "p", id: "second" });
});

test("resolveDefaultModel uses first model when no primary", () => {
  const config: AgentConfigFile = {
    providers: [
      {
        id: "p",
        baseUrl: "",
        apiKey: "",
        protocol: "openai-completions",
        models: [{ id: "first" }, { id: "second" }],
      },
    ],
  };
  const result = resolveDefaultModel(config);
  expect(result).toEqual({ provider: "p", id: "first" });
});

test("resolveDefaultModel returns undefined for empty config", () => {
  const config: AgentConfigFile = { providers: [] };
  expect(resolveDefaultModel(config)).toBeUndefined();
});

// ---------------------------------------------------------------------------
// registerConfigModels
// ---------------------------------------------------------------------------

test("registerConfigModels registers models with defaults applied", () => {
  clearModels();
  const config: AgentConfigFile = {
    providers: [{
      id: "test",
      baseUrl: "https://test.example/v1",
      apiKey: "test-key",
      protocol: "openai-completions",
      models: [{ id: "test-model" }],
    }],
  };
  registerConfigModels(config);

  const model = getModel("test", "test-model");
  expect(model).toBeDefined();
  expect(model!.id).toBe("test-model");
  expect(model!.name).toBe("test-model"); // defaults to id
  expect(model!.protocol).toBe("openai-completions");
  expect(model!.provider).toBe("test");
  expect(model!.baseUrl).toBe("https://test.example/v1");
  expect(model!.apiKey).toBe("test-key");
  expect(model!.reasoning).toBe(false);
  expect(model!.input).toEqual(["text"]);
  expect(model!.contextWindow).toBe(128_000);
  expect(model!.maxTokens).toBe(16_384);
  expect(model!.cost).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  expect(model!.timeoutMs).toBe(60_000);
  clearModels();
});

test("registerConfigModels uses model name when provided", () => {
  clearModels();
  const config: AgentConfigFile = {
    providers: [{
      id: "test",
      baseUrl: "",
      apiKey: "",
      protocol: "openai-completions",
      models: [{ id: "test-model", name: "Custom Name" }],
    }],
  };
  registerConfigModels(config);
  const model = getModel("test", "test-model");
  expect(model!.name).toBe("Custom Name");
  clearModels();
});

test("registerConfigModels propagates provider-level transport params to models", () => {
  clearModels();
  const config: AgentConfigFile = {
    providers: [{
      id: "test",
      baseUrl: "",
      apiKey: "",
      protocol: "openai-completions",
      timeoutMs: 30000,
      maxRetries: 3,
      retryDelayMs: 2000,
      models: [{ id: "test-model" }],
    }],
  };
  registerConfigModels(config);
  const model = getModel("test", "test-model");
  expect(model!.timeoutMs).toBe(30000);
  expect(model!.maxRetries).toBe(3);
  expect(model!.retryDelayMs).toBe(2000);
  clearModels();
});

test("registerConfigModels registers multiple providers", () => {
  clearModels();
  const config: AgentConfigFile = {
    providers: [
      {
        id: "p1",
        baseUrl: "",
        apiKey: "",
        protocol: "openai-completions",
        models: [{ id: "m1" }],
      },
      {
        id: "p2",
        baseUrl: "",
        apiKey: "",
        protocol: "anthropic-messages",
        models: [{ id: "m2" }],
      },
    ],
  };
  registerConfigModels(config);
  expect(getModel("p1", "m1")).toBeDefined();
  expect(getModel("p2", "m2")).toBeDefined();
  expect(getModel("p2", "m2")!.protocol).toBe("anthropic-messages");
  clearModels();
});

test("registerConfigModels applies partial cost overrides", () => {
  clearModels();
  const config: AgentConfigFile = {
    providers: [{
      id: "test",
      baseUrl: "",
      apiKey: "",
      protocol: "openai-completions",
      models: [{ id: "m", cost: { input: 5, output: 10 } }],
    }],
  };
  registerConfigModels(config);
  const model = getModel("test", "m");
  expect(model!.cost.input).toBe(5);
  expect(model!.cost.output).toBe(10);
  expect(model!.cost.cacheRead).toBe(0); // default
  expect(model!.cost.cacheWrite).toBe(0); // default
  clearModels();
});

test("registerConfigModels handles provider display name", () => {
  clearModels();
  const config: AgentConfigFile = {
    providers: [{
      id: "test",
      name: "Test Provider",
      baseUrl: "",
      apiKey: "",
      protocol: "openai-completions",
      models: [{ id: "m" }],
    }],
  };
  registerConfigModels(config);
  const model = getModel("test", "m");
  // provider name is not stored on Model; only on ProviderConfigFromFile
  expect(model!.provider).toBe("test");
  clearModels();
});

test("registerConfigModels handles provider headers", () => {
  clearModels();
  const config: AgentConfigFile = {
    providers: [{
      id: "test",
      baseUrl: "",
      apiKey: "",
      protocol: "openai-completions",
      headers: { "X-Custom": "value" },
      models: [{ id: "m" }],
    }],
  };
  registerConfigModels(config);
  const model = getModel("test", "m");
  expect(model!.headers).toEqual({ "X-Custom": "value" });
  clearModels();
});
