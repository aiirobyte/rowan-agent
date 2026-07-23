import { createId } from "../utils";
import type { AgentConfig, ConfigProvider, ConfigPutResult, ConfigResolution } from "./contracts";
import type { AgentId, ConfigToken, Metadata } from "../runtime-events";
import { CONFIG_TOKEN_BYTES } from "./idempotency";
import { assertUtf8ByteLimit } from "./json";

type ConfigEntry = Readonly<{
  agentId: AgentId;
  identity: string;
  config: AgentConfig;
}>;

type ConfigOperation = Readonly<{
  agentId: AgentId;
  identity: string;
  token: ConfigToken;
}>;

/** A deterministic provider for tests and embedded hosts without a separate registry. */
export class InMemoryConfigProvider implements ConfigProvider {
  private readonly entries = new Map<ConfigToken, ConfigEntry>();
  private readonly operations = new Map<string, ConfigOperation>();

  async put(input: {
    agentId: AgentId;
    agentMetadata?: Metadata;
    config: AgentConfig;
    operationId: string;
    signal: AbortSignal;
  }): Promise<ConfigPutResult> {
    throwIfAborted(input.signal);
    assertConfigIdentity(input.config.identity);
    assertOperationId(input.operationId);
    const previous = this.operations.get(input.operationId);
    if (previous) {
      return previous.agentId === input.agentId && previous.identity === input.config.identity
        ? { kind: "stored", token: previous.token }
        : { kind: "identity_conflict" };
    }

    const token = createId("cfg") as ConfigToken;
    const snapshot = snapshotConfig(input.config);
    this.entries.set(token, { agentId: input.agentId, identity: snapshot.identity, config: snapshot });
    this.operations.set(input.operationId, { agentId: input.agentId, identity: snapshot.identity, token });
    return { kind: "stored", token };
  }

  async resolve(input: {
    agentId: AgentId;
    agentMetadata?: Metadata;
    token: ConfigToken;
    signal: AbortSignal;
  }): Promise<ConfigResolution> {
    throwIfAborted(input.signal);
    const entry = this.entries.get(input.token);
    if (!entry) return { kind: "unavailable", reason: "Config Token is not retained." };
    if (entry.agentId !== input.agentId) return { kind: "unavailable", reason: "Config Token belongs to another Agent." };
    return { kind: "available", config: entry.config };
  }
}

export function brandConfigToken(raw: unknown): ConfigToken {
  if (typeof raw !== "string" || raw.length === 0) throw new TypeError("Config Provider returned an invalid Config Token");
  assertUtf8ByteLimit(raw, CONFIG_TOKEN_BYTES, "configToken");
  return raw as ConfigToken;
}

export function validateConfigResolution(
  agentId: AgentId,
  value: unknown,
): ConfigResolution {
  if (!isRecord(value) || typeof value.kind !== "string") {
    throw new Error(`Config Provider returned an invalid resolution for Agent ${agentId}.`);
  }
  if (value.kind === "deferred") {
    if (value.retryAfterMs !== undefined && (!Number.isInteger(value.retryAfterMs) || (value.retryAfterMs as number) < 0)) {
      throw new Error(`Config Provider returned an invalid retry hint for Agent ${agentId}.`);
    }
    return {
      kind: "deferred",
      ...(value.retryAfterMs === undefined ? {} : { retryAfterMs: value.retryAfterMs as number }),
    };
  }
  if (value.kind === "unavailable" && typeof value.reason === "string") return { kind: "unavailable", reason: value.reason };
  if (value.kind === "available" && isRecord(value.config) && typeof value.config.identity === "string") {
    return { kind: "available", config: value.config as AgentConfig };
  }
  throw new Error(`Config Provider returned an invalid resolution for Agent ${agentId}.`);
}

function snapshotConfig(config: AgentConfig): AgentConfig {
  const context = Object.freeze({
    ...config.context,
    tools: Object.freeze([...config.context.tools]),
    skills: Object.freeze([...config.context.skills]),
  });
  return Object.freeze({ ...config, context });
}

function assertConfigIdentity(identity: string): void {
  if (typeof identity !== "string" || identity.length === 0) throw new TypeError("config.identity must be non-empty");
  assertUtf8ByteLimit(identity, 256, "config.identity");
}

function assertOperationId(operationId: string): void {
  if (typeof operationId !== "string" || operationId.length === 0) throw new TypeError("operationId must be non-empty");
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  const error = new Error("Config Provider operation aborted.");
  error.name = "AbortError";
  throw error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
