import type { AgentId, Metadata } from "../runtime-events";
import type { UserInput } from "./contracts";
import { assertUtf8ByteLimit, canonicalJson } from "./json";
import { normalizeUserInput } from "./contracts";

export const IDEMPOTENCY_KEY_BYTES = 256;
export const CONSUMER_ID_BYTES = 256;
export const CONFIG_IDENTITY_BYTES = 256;
export const CONFIG_TOKEN_BYTES = 1_024;
export const METADATA_JSON_BYTES = 64 * 1024;
export const MESSAGE_CONTENT_JSON_BYTES = 16 * 1024 * 1024;
export const CHECKPOINT_JSON_BYTES = 4 * 1024 * 1024;
export const TOOL_VALUE_JSON_BYTES = 16 * 1024 * 1024;
export const OUTCOME_JSON_BYTES = 4 * 1024 * 1024;
export type CreateAgentIdempotencyScope = readonly ["create_agent", string];
export type UpdateAgentConfigIdempotencyScope = readonly ["update_agent_config", AgentId, string];
export type StartRunIdempotencyScope = readonly ["start_run", AgentId, string];
export type IdempotencyScope = CreateAgentIdempotencyScope | UpdateAgentConfigIdempotencyScope | StartRunIdempotencyScope;

function assertKey(key: string): void {
  if (typeof key !== "string" || key.length === 0) throw new TypeError("idempotencyKey must be non-empty");
  assertUtf8ByteLimit(key, IDEMPOTENCY_KEY_BYTES, "idempotencyKey");
}
export function createIdempotencyScope(kind: "create_agent", key: string): CreateAgentIdempotencyScope;
export function createIdempotencyScope(kind: "update_agent_config", agentId: AgentId, key: string): UpdateAgentConfigIdempotencyScope;
export function createIdempotencyScope(kind: "start_run", agentId: AgentId, key: string): StartRunIdempotencyScope;
export function createIdempotencyScope(kind: IdempotencyScope[0], agentOrKey: AgentId | string, maybeKey?: string): IdempotencyScope {
  const key = kind === "create_agent" ? agentOrKey : maybeKey;
  if (typeof key !== "string") throw new TypeError("idempotencyKey must be a string");
  assertKey(key);
  if (kind === "create_agent") return [kind, key];
  if (typeof agentOrKey !== "string" || agentOrKey.length === 0) throw new TypeError("agentId must be non-empty");
  return [kind, agentOrKey as AgentId, key] as UpdateAgentConfigIdempotencyScope | StartRunIdempotencyScope;
}
export function encodeIdempotencyScope(storeIncarnation: string, scope: IdempotencyScope): string {
  if (typeof storeIncarnation !== "string" || storeIncarnation.length === 0) throw new TypeError("storeIncarnation must be non-empty");
  return canonicalJson([storeIncarnation, ...scope] as never);
}
export function canonicalStartRunRequest(input: UserInput, metadata?: Metadata): string {
  const normalized = normalizeUserInput(input);
  if (metadata !== undefined) assertUtf8ByteLimit(canonicalJson(metadata), METADATA_JSON_BYTES, "run.metadata");
  return canonicalJson({ input: normalized, ...(metadata === undefined ? {} : { metadata }) } as never);
}
