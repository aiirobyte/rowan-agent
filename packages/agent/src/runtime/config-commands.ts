import type { AgentConfig, AgentRecord, ConfigProvider, ConfigResolution, OwnedStore } from "./contracts";
import type { AgentId, ConfigToken, Metadata } from "../runtime-events";
import { assertAgentConfig } from "./contracts";
import { brandConfigToken, validateConfigResolution } from "./config-provider";
import { CONFIG_IDENTITY_BYTES } from "./idempotency";
import { assertUtf8ByteLimit } from "./json";
import { RuntimeError } from "./errors";

export const CONFIG_PROVIDER_DEADLINE_MS = 30_000;

export class ConfigCommandService {
  constructor(
    private readonly store: OwnedStore,
    private readonly configs: ConfigProvider,
    private readonly storeIncarnation: string,
  ) {}

  async createAgent(input: { config: AgentConfig; metadata?: Metadata; idempotencyKey: string; signal?: AbortSignal }): Promise<AgentId> {
    assertAgentConfig(input.config);
    assertIdentity(input.config.identity);
    const reserved = await this.store.reserveAgent({
      idempotencyKey: input.idempotencyKey,
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
      configIdentity: input.config.identity,
    });
    if (reserved.activatedAt && reserved.currentConfigToken) return reserved.id;

    const operationId = this.operationId("create_agent", reserved.id, input.idempotencyKey);
    const result = await this.put({
      agentId: reserved.id,
      agentMetadata: reserved.metadata,
      config: input.config,
      operationId,
      signal: input.signal,
    });
    if (result.kind === "identity_conflict") throw idempotencyConflict("create_agent", input.idempotencyKey);
    const token = brandConfigToken(result.token);
    await this.store.activateAgent(reserved.id, token, input.config.identity);
    return reserved.id;
  }

  async updateAgentConfig(input: { agentId: AgentId; config: AgentConfig; idempotencyKey: string; signal?: AbortSignal }): Promise<void> {
    assertAgentConfig(input.config);
    assertIdentity(input.config.identity);
    const agent = await this.findAgent(input.agentId);
    const operationId = this.operationId("update_agent_config", input.agentId, input.idempotencyKey);
    const result = await this.put({
      agentId: input.agentId,
      agentMetadata: agent.metadata,
      config: input.config,
      operationId,
      signal: input.signal,
    });
    if (result.kind === "identity_conflict") throw idempotencyConflict("update_agent_config", input.idempotencyKey);
    await this.store.updateAgentConfigToken({
      agentId: input.agentId,
      token: brandConfigToken(result.token),
      configIdentity: input.config.identity,
      idempotencyKey: input.idempotencyKey,
    });
  }

  async resolve(input: { agent: AgentRecord; token: ConfigToken; signal?: AbortSignal }): Promise<ConfigResolution> {
    const result = await this.callProvider(
      (signal) => this.configs.resolve({ agentId: input.agent.id, agentMetadata: input.agent.metadata, token: input.token, signal }),
      input.signal,
    );
    const resolution = validateConfigResolution(input.agent.id, result);
    return resolution;
  }

  private async findAgent(agentId: AgentId): Promise<AgentRecord> {
    const agent = (await this.store.listAgents()).find((candidate) => candidate.id === agentId);
    if (!agent) throw new RuntimeError("agent_not_found", { agentId });
    return agent;
  }

  private async put(input: {
    agentId: AgentId;
    agentMetadata?: Metadata;
    config: AgentConfig;
    operationId: string;
    signal?: AbortSignal;
  }) {
    return this.callProvider(
      (signal) => this.configs.put({ ...input, signal }),
      input.signal,
    );
  }

  private async callProvider<T>(call: (signal: AbortSignal) => Promise<T>, callerSignal?: AbortSignal): Promise<T> {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (callerSignal?.aborted) onAbort();
    else callerSignal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), CONFIG_PROVIDER_DEADLINE_MS);
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    let callerAbort!: (reason?: unknown) => void;
    const callerAborted = new Promise<T>((_, reject) => { callerAbort = reject; });
    const onCallerAbort = () => {
      const error = new Error("Config Provider operation aborted.");
      error.name = "AbortError";
      callerAbort(error);
    };
    if (callerSignal?.aborted) onCallerAbort();
    else callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
    try {
      return await Promise.race([
        call(controller.signal),
        new Promise<T>((_, reject) => {
          deadlineTimer = setTimeout(() => reject(configurationUnavailable("provider deadline exceeded")), CONFIG_PROVIDER_DEADLINE_MS);
        }),
        callerAborted,
      ]);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      if (error instanceof RuntimeError) throw error;
      throw configurationUnavailable(error instanceof Error ? error.message : "Config Provider failed");
    } finally {
      clearTimeout(timer);
      if (deadlineTimer) clearTimeout(deadlineTimer);
      callerSignal?.removeEventListener("abort", onAbort);
      callerSignal?.removeEventListener("abort", onCallerAbort);
    }
  }

  private operationId(kind: string, agentId: AgentId, key: string): string {
    return `${this.storeIncarnation}:${kind}:${agentId}:${key}`;
  }
}

function assertIdentity(identity: string): void {
  if (typeof identity !== "string" || identity.length === 0) throw new TypeError("config.identity must be non-empty");
  assertUtf8ByteLimit(identity, CONFIG_IDENTITY_BYTES, "config.identity");
}

function idempotencyConflict(scope: "create_agent" | "update_agent_config", idempotencyKey: string): RuntimeError<"idempotency_conflict"> {
  return new RuntimeError("idempotency_conflict", { scope, idempotencyKey });
}

function configurationUnavailable(reason: string): RuntimeError<"configuration_unavailable"> {
  return new RuntimeError("configuration_unavailable", { agentId: "unknown" as AgentId, retryable: true, reason });
}
