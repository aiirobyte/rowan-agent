import type { AgentMessage, Outcome, ToolResult } from "../protocol";

declare const opaqueIdBrand: unique symbol;

export type OpaqueId<Kind extends string> = string & {
  readonly [opaqueIdBrand]: Kind;
};

export type AgentId = OpaqueId<"AgentId">;
export type FactoryId = OpaqueId<"FactoryId">;
export type AgentRunId = OpaqueId<"AgentRunId">;
export type RuntimeMessageId = OpaqueId<"RuntimeMessageId">;
export type RuntimeEventId = OpaqueId<"RuntimeEventId">;
export type LeaseId = OpaqueId<"LeaseId">;
export type RuntimeToolCallId = OpaqueId<"RuntimeToolCallId">;

export function asFactoryId(value: string): FactoryId {
  if (value.trim().length === 0) {
    throw new Error("Factory ID must not be empty.");
  }
  return value as FactoryId;
}

export type AgentLifecycleState = "active" | "paused" | "stopped";

export type RuntimeMessageState = "queued" | "leased" | "acknowledged" | "dead_lettered";

export type AgentRunState = "queued" | "running" | "suspended" | "completed" | "failed" | "cancelled";

export type RuntimeEventState = "pending" | "acknowledged";

export type RuntimeToolCallState = "queued" | "running" | "completed" | "failed" | "indeterminate";

export type AgentRecord = {
  id: AgentId;
  sessionId: string;
  factoryId?: FactoryId;
  state: AgentLifecycleState;
  createdAt: string;
  updatedAt: string;
};

export type AgentInputMessage = {
  type: "agent_input";
  input: AgentMessage;
};

export type ChildRunCompletionMessage = {
  type: "child_run_completion";
  childAgentId: AgentId;
  childRunId: AgentRunId;
  parentRunId: AgentRunId;
  outcome: Outcome;
};

export type RuntimeMessagePayload = AgentInputMessage | ChildRunCompletionMessage;

export type RuntimeLease = {
  id: LeaseId;
  runId: AgentRunId;
  workerId: string;
  leasedAt: string;
  expiresAt: string;
};

export type RuntimeMessage = {
  id: RuntimeMessageId;
  agentId: AgentId;
  kind: RuntimeMessagePayload["type"];
  payload: RuntimeMessagePayload;
  state: RuntimeMessageState;
  attempts: number;
  runId?: AgentRunId;
  lease?: RuntimeLease;
  deadLetterReason?: string;
  createdAt: string;
  updatedAt: string;
};

export type AgentRunRecord = {
  id: AgentRunId;
  agentId: AgentId;
  messageId: RuntimeMessageId;
  parentRunId?: AgentRunId;
  state: AgentRunState;
  attempt: number;
  leaseId?: LeaseId;
  outcome?: Outcome;
  suspensionReason?: string;
  createdAt: string;
  updatedAt: string;
};

export type RuntimeEventKind =
  | "agent_created"
  | "message_enqueued"
  | "run_enqueued"
  | "run_leased"
  | "lease_expired"
  | "run_suspended"
  | "run_completed"
  | "run_aborted"
  | "message_acknowledged"
  | "message_dead_lettered"
  | "tool_call_created"
  | "tool_call_started"
  | "tool_call_completed"
  | "tool_call_indeterminate";

export type RuntimeEvent = {
  id: RuntimeEventId;
  kind: RuntimeEventKind;
  state: RuntimeEventState;
  agentId?: AgentId;
  messageId?: RuntimeMessageId;
  runId?: AgentRunId;
  toolCallId?: RuntimeToolCallId;
  payload?: unknown;
  createdAt: string;
};

export type RuntimeToolCall = {
  id: RuntimeToolCallId;
  agentId: AgentId;
  runId: AgentRunId;
  name: string;
  args: unknown;
  state: RuntimeToolCallState;
  result?: ToolResult;
  indeterminateReason?: string;
  createdAt: string;
  updatedAt: string;
};
