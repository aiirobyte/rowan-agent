import { createId } from "../utils";
import { isAgentConfiguration, type AgentConfigRequest, type ConfigProvider, type ConfigPutResult, type ConfigResolution } from "./contracts";
import type { AgentConfiguration } from "./configuration-snapshot";
import type { AgentId, ConfigToken, Metadata } from "../runtime-events";
import { CONFIG_TOKEN_BYTES } from "./idempotency";
import { assertUtf8ByteLimit, canonicalJson } from "./json";
import type { JsonValue } from "../runtime-events";
import type { ResourceKind } from "./resource-registry";
import type { Phase, PhaseRegistry } from "../harness/phases/types";
import { validateMaxAttempts } from "../loop/types";

type ConfigEntry = Readonly<{
  agentId: AgentId;
  identity: string;
  config: AgentConfigRequest;
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
    config: AgentConfigRequest;
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
    return { kind: "available", config: value.config as AgentConfigRequest };
  }
  throw new Error(`Config Provider returned an invalid resolution for Agent ${agentId}.`);
}

function snapshotConfig(config: AgentConfigRequest): AgentConfigRequest {
  validateMaxAttempts(config.maxAttempts);
  if (isAgentConfiguration(config)) return snapshotConfiguration(config);
  const definition = Object.freeze({
    ...config.definition,
    ...(config.definition.tools ? { tools: Object.freeze([...config.definition.tools]) } : {}),
    ...(config.definition.skills ? { skills: Object.freeze([...config.definition.skills]) } : {}),
    ...(config.definition.bundledSkills ? {
      bundledSkills: Object.freeze(config.definition.bundledSkills.map((skill) => Object.freeze({ ...skill }))),
    } : {}),
    ...(config.definition.phases ? {
      phases: Object.freeze({
        entryPhaseId: config.definition.phases.entryPhaseId,
        phaseIds: Object.freeze([...config.definition.phases.phaseIds]),
      }),
    } : {}),
    ...(config.definition.contexts ? { contexts: Object.freeze([...config.definition.contexts]) } : {}),
  });
  const resources = Object.freeze({
    ...config.resources,
    tools: Object.freeze([...config.resources.tools]),
    skills: Object.freeze([...config.resources.skills]),
    ...(config.resources.phases ? { phases: snapshotPhaseRegistry(config.resources.phases) } : {}),
    ...(config.resources.resourceView ? {
      resourceView: Object.freeze({
        agents: Object.freeze([...config.resources.resourceView.agents]),
        tools: Object.freeze([...config.resources.resourceView.tools]),
        skills: Object.freeze([...config.resources.resourceView.skills]),
        phases: Object.freeze([...config.resources.resourceView.phases]),
      }),
    } : {}),
    ...(config.resources.resourceRefs ? { resourceRefs: Object.freeze(config.resources.resourceRefs.map((ref) => Object.freeze({ ...ref }))) } : {}),
    ...(config.resources.resourceRevisions ? {
      resourceRevisions: Object.freeze(Object.fromEntries(
        Object.entries(config.resources.resourceRevisions).map(([kind, revisions]) => [kind, Object.freeze([...(revisions as readonly string[])])]),
      )) as Readonly<Record<ResourceKind, readonly string[]>>,
    } : {}),
    ...(config.resources.contexts ? {
      contexts: Object.freeze(config.resources.contexts.map((context) => Object.freeze({
        name: context.name,
        value: snapshotJsonValue(context.value),
      }))),
    } : {}),
  });
  return Object.freeze({ ...config, definition, resources });
}

function snapshotPhaseRegistry(registry: PhaseRegistry): PhaseRegistry {
  const phases = new Map<string, Phase>();
  for (const [name, phase] of registry.phases) phases.set(name, snapshotPhase(phase));
  return { phases, entryPhaseId: registry.entryPhaseId };
}

function snapshotPhase(phase: Phase): Phase {
  return Object.freeze({
    ...phase,
    ...(phase.tools ? { tools: Object.freeze([...phase.tools]) as unknown as Phase["tools"] } : {}),
    skills: Object.freeze((phase.skills ?? []).map((skill) => Object.freeze({ ...skill }))),
    ...(phase.input ? { input: Object.freeze({ ...phase.input }) as unknown as Phase["input"] } : {}),
    ...(phase.model ? { model: Object.freeze({ ...phase.model }) as unknown as Phase["model"] } : {}),
  }) as unknown as Phase;
}

function snapshotConfiguration(config: AgentConfiguration): AgentConfiguration {
  const layer = config.definition.layer;
  const definition = Object.freeze({
    name: config.definition.name,
    ...(layer === undefined ? {} : {
      layer: Object.freeze({
        ...layer,
        ...(layer.tools ? { tools: Object.freeze([...layer.tools]) } : {}),
        ...(layer.skills ? { skills: Object.freeze([...layer.skills]) } : {}),
        ...(layer.phases ? {
          phases: Object.freeze({
            entryPhaseId: layer.phases.entryPhaseId,
            phaseIds: Object.freeze([...layer.phases.phaseIds]),
          }),
        } : {}),
      }),
    }),
  });
  const resourceView = Object.freeze({
    agents: Object.freeze([...config.resourceView.agents]),
    tools: Object.freeze([...config.resourceView.tools]),
    skills: Object.freeze([...config.resourceView.skills]),
    phases: Object.freeze([...config.resourceView.phases]),
  });
  return Object.freeze({
    ...config,
    definition,
    resourceView,
    ...(config.contexts ? {
      contexts: Object.freeze(config.contexts.map((context) => Object.freeze({
        name: context.name,
        value: snapshotJsonValue(context.value),
      }))),
    } : {}),
  });
}

function snapshotJsonValue(value: JsonValue): JsonValue {
  return deepFreeze(JSON.parse(canonicalJson(value)) as JsonValue);
}

function deepFreeze<T extends JsonValue>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child as JsonValue);
    Object.freeze(value);
  }
  return value;
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
