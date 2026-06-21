import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { registerModel } from "@rowan-agent/models";
import type { LlmModelRef, Model, ModelCost, Protocol } from "@rowan-agent/models";
import type { WorkspacePaths } from "./env/path";

// ---------------------------------------------------------------------------
// Config file types (mirror config.yaml structure)
// ---------------------------------------------------------------------------

export type ModelConfigFromFile = {
  id: string;
  name?: string;
  primary?: boolean;
  reasoning?: boolean;
  input?: ("text" | "image")[];
  contextWindow?: number;
  maxTokens?: number;
  cost?: Partial<ModelCost>;
};

export type ProviderConfigFromFile = {
  id: string;
  name?: string;
  baseUrl: string;
  apiKey: string;
  protocol: Protocol;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  headers?: Record<string, string>;
  models: ModelConfigFromFile[];
};

export type AgentConfigFile = {
  model?: { provider: string; id: string };
  logLevel?: "debug" | "info" | "warn" | "error" | "silent";
  providers: ProviderConfigFromFile[];
};

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_REASONING = false;
const DEFAULT_INPUT: ("text" | "image")[] = ["text"];
const DEFAULT_CONTEXT_WINDOW = 128_000;
const DEFAULT_MAX_TOKENS = 16_384;
const DEFAULT_COST: ModelCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
const DEFAULT_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// Env var interpolation
// ---------------------------------------------------------------------------

const ENV_VAR_PATTERN = /\$\{([^}]+)\}/g;

export function interpolateEnvVars(value: string): string {
  return value.replace(ENV_VAR_PATTERN, (match, varName: string) => {
    const resolved = process.env[varName];
    if (resolved === undefined || resolved === "") {
      throw new Error(
        `Environment variable "${varName}" is not set but is referenced in config.yaml via "${match}".`,
      );
    }
    return resolved;
  });
}

// ---------------------------------------------------------------------------
// Config file loading
// ---------------------------------------------------------------------------

const CONFIG_CANDIDATES = ["config.yaml", "config.yml"];

export async function loadConfigFile(
  workspace: WorkspacePaths,
): Promise<AgentConfigFile | undefined> {
  let configPath: string | undefined;
  let configFilename: typeof CONFIG_CANDIDATES[number] | undefined;
  for (const candidate of CONFIG_CANDIDATES) {
    const p = join(workspace.rowanDir, candidate);
    if (existsSync(p)) {
      configPath = p;
      configFilename = candidate;
      break;
    }
  }
  if (!configPath || !configFilename) {
    return undefined;
  }

  const raw = await readFile(configPath, "utf8");
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse .rowan/${configFilename}: ${message}`);
  }

  if (parsed === null || parsed === undefined) {
    return undefined;
  }

  return validateConfigFile(parsed, configFilename);
}

function validateConfigFile(parsed: unknown, configFilename: string): AgentConfigFile {
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`.rowan/${configFilename} must be a YAML object at the top level.`);
  }
  const obj = parsed as Record<string, unknown>;

  const providers = obj.providers;
  if (!Array.isArray(providers)) {
    throw new Error(`.rowan/${configFilename} must have a "providers" array.`);
  }

  const validatedProviders: ProviderConfigFromFile[] = providers.map((p, i) => {
    if (typeof p !== "object" || p === null) {
      throw new Error(`providers[${i}] must be an object.`);
    }
    const provider = p as Record<string, unknown>;
    if (typeof provider.id !== "string" || !provider.id) {
      throw new Error(`providers[${i}].id is required and must be a non-empty string.`);
    }
    if (typeof provider.baseUrl !== "string" || !provider.baseUrl) {
      throw new Error(`providers[${i}].baseUrl is required and must be a non-empty string.`);
    }
    if (typeof provider.apiKey !== "string" || !provider.apiKey) {
      throw new Error(`providers[${i}].apiKey is required and must be a non-empty string.`);
    }
    if (typeof provider.protocol !== "string" || !provider.protocol) {
      throw new Error(`providers[${i}].protocol is required and must be a non-empty string.`);
    }
    if (!Array.isArray(provider.models) || provider.models.length === 0) {
      throw new Error(`providers[${i}].models must be a non-empty array.`);
    }

    const interpolatedApiKey = interpolateEnvVars(provider.apiKey);

    const validatedModels: ModelConfigFromFile[] = provider.models.map((m, j) => {
      if (typeof m !== "object" || m === null) {
        throw new Error(`providers[${i}].models[${j}] must be an object.`);
      }
      const model = m as Record<string, unknown>;
      if (typeof model.id !== "string" || !model.id) {
        throw new Error(`providers[${i}].models[${j}].id is required and must be a non-empty string.`);
      }
      return model as unknown as ModelConfigFromFile;
    });

    return {
      id: provider.id,
      baseUrl: provider.baseUrl,
      apiKey: interpolatedApiKey,
      protocol: provider.protocol as Protocol,
      ...(typeof provider.name === "string" ? { name: provider.name } : {}),
      ...(typeof provider.timeoutMs === "number" ? { timeoutMs: provider.timeoutMs } : {}),
      ...(typeof provider.maxRetries === "number" ? { maxRetries: provider.maxRetries } : {}),
      ...(typeof provider.retryDelayMs === "number" ? { retryDelayMs: provider.retryDelayMs } : {}),
      ...(provider.headers && typeof provider.headers === "object" ? { headers: provider.headers as Record<string, string> } : {}),
      models: validatedModels,
    };
  });

  const result: AgentConfigFile = { providers: validatedProviders };

  if (obj.model && typeof obj.model === "object") {
    const modelRef = obj.model as Record<string, unknown>;
    if (typeof modelRef.provider !== "string" || typeof modelRef.id !== "string") {
      throw new Error(`.rowan/${configFilename} "model" must have "provider" and "id" string fields.`);
    }
    result.model = { provider: modelRef.provider, id: modelRef.id };
  }

  if (obj.logLevel !== undefined) {
    const valid = ["debug", "info", "warn", "error", "silent"];
    if (typeof obj.logLevel !== "string" || !valid.includes(obj.logLevel)) {
      throw new Error(`.rowan/${configFilename} "logLevel" must be one of: ${valid.join(", ")}.`);
    }
    result.logLevel = obj.logLevel as AgentConfigFile["logLevel"];
  }

  return result;
}

// ---------------------------------------------------------------------------
// Default model resolution
// ---------------------------------------------------------------------------

export function resolveDefaultModel(config: AgentConfigFile): LlmModelRef | undefined {
  // 1. Top-level model: override
  if (config.model) {
    return { provider: config.model.provider, id: config.model.id };
  }

  // 2. First model marked primary: true (by file order)
  for (const provider of config.providers) {
    for (const model of provider.models) {
      if (model.primary) {
        return { provider: provider.id, id: model.id };
      }
    }
  }

  // 3. First model in config (by parse order)
  for (const provider of config.providers) {
    if (provider.models.length > 0) {
      return { provider: provider.id, id: provider.models[0].id };
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Register models from config into the model registry
// ---------------------------------------------------------------------------

export function registerConfigModels(config: AgentConfigFile): void {
  for (const provider of config.providers) {
    for (const fileModel of provider.models) {
      const model: Model = {
        id: fileModel.id,
        name: fileModel.name ?? fileModel.id,
        protocol: provider.protocol,
        provider: provider.id,
        baseUrl: provider.baseUrl,
        reasoning: fileModel.reasoning ?? DEFAULT_REASONING,
        input: fileModel.input ?? DEFAULT_INPUT,
        cost: { ...DEFAULT_COST, ...fileModel.cost },
        contextWindow: fileModel.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
        maxTokens: fileModel.maxTokens ?? DEFAULT_MAX_TOKENS,
        apiKey: provider.apiKey,
        timeoutMs: provider.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        ...(provider.maxRetries !== undefined ? { maxRetries: provider.maxRetries } : {}),
        ...(provider.retryDelayMs !== undefined ? { retryDelayMs: provider.retryDelayMs } : {}),
        ...(provider.headers ? { headers: provider.headers } : {}),
      };
      registerModel(model);
    }
  }
}

// ---------------------------------------------------------------------------
// Model ref parsing (shared with phases/loader)
// ---------------------------------------------------------------------------

export function parseModelRef(input?: string): LlmModelRef | undefined {
  if (!input) return undefined;
  const slashIndex = input.indexOf("/");
  if (slashIndex === -1) {
    return { provider: "*", id: input };
  }
  return {
    provider: input.slice(0, slashIndex),
    id: input.slice(slashIndex + 1),
  };
}
