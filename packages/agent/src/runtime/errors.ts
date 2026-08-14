import type { AgentId, InputRequestId, MessageId, RunId, RunState, ToolCallId } from "../runtime-events";

export type RuntimeErrorCode =
  | "invalid_argument"
  | "runtime_closed"
  | "runtime_already_owned"
  | "runtime_ownership_lost"
  | "agent_not_found"
  | "run_not_found"
  | "run_state_conflict"
  | "message_revision_conflict"
  | "tool_effect_confirmation_required"
  | "input_request_conflict"
  | "idempotency_conflict"
  | "configuration_unavailable"
  | "checkpoint_incompatible"
  | "consumer_already_active"
  | "invalid_cursor"
  | "store_unavailable"
  | "unsupported_store_version";

export type RuntimeErrorDetails = {
  invalid_argument: Readonly<{ argument: string; reason: string }>;
  runtime_closed: null;
  runtime_already_owned: Readonly<{ expiresAt: string; retryAfterMs: number }>;
  runtime_ownership_lost: Readonly<{
    reason: "expired" | "released" | "epoch_advanced";
    expectedEpoch: number;
    actualEpoch: number;
    expiresAt?: string;
  }>;
  agent_not_found: Readonly<{ agentId: AgentId }>;
  run_not_found: Readonly<{ runId: RunId }>;
  run_state_conflict: Readonly<{ runId: RunId; expected: readonly RunState[]; actual: RunState }>;
  message_revision_conflict: Readonly<{ agentId: AgentId; messageId: MessageId; expected: number; actual: number }>;
  tool_effect_confirmation_required: Readonly<{
    agentId: AgentId;
    messageId: MessageId;
    effectDigest: string;
    toolCallIds: readonly ToolCallId[];
  }>;
  input_request_conflict: Readonly<{
    runId: RunId;
    requestId: InputRequestId;
    reason: "not_found" | "wrong_run" | "different_answer";
  }>;
  idempotency_conflict: Readonly<{
    scope: "create_agent" | "update_agent_config" | "start_run";
    idempotencyKey: string;
  }>;
  configuration_unavailable: Readonly<{ agentId: AgentId; runId?: RunId; retryable: boolean; reason: string }>;
  checkpoint_incompatible: Readonly<{
    runId: RunId;
    expected: Readonly<{ codec: string; versions: readonly number[] }>;
    actual: Readonly<{ codec: string; version: number }>;
  }>;
  consumer_already_active: Readonly<{ consumerId: string }>;
  invalid_cursor: Readonly<{
    cursorType: "agent_list" | "run_list" | "event";
    reason: "malformed" | "wrong_store" | "wrong_collection" | "filter_mismatch" | "beyond_waterline" | "expired";
  }>;
  store_unavailable: Readonly<{ operation: string; retryable: boolean; reason: string }>;
  unsupported_store_version: Readonly<{ found: string | null; supported: string }>;
};

export type AnyRuntimeError = {
  [Code in RuntimeErrorCode]: RuntimeError<Code>;
}[RuntimeErrorCode];

export class RuntimeError<Code extends RuntimeErrorCode = RuntimeErrorCode> extends Error {
  readonly code: Code;
  readonly details: RuntimeErrorDetails[Code];

  constructor(code: Code, details: RuntimeErrorDetails[Code], message = code) {
    super(message);
    this.name = "RuntimeError";
    this.code = code;
    this.details = details;
  }
}

export function isRuntimeError(value: unknown): value is AnyRuntimeError {
  return value instanceof RuntimeError;
}
