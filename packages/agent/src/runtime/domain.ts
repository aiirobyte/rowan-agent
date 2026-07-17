import type { AgentMessage, Outcome, ToolResult } from "../protocol";

declare const opaqueIdBrand: unique symbol;

export type OpaqueId<Kind extends string> = string & {
  readonly [opaqueIdBrand]: Kind;
};

export type AgentId = OpaqueId<"AgentId">;
export type AgentRunId = OpaqueId<"AgentRunId">;
export type RuntimeMessageId = OpaqueId<"RuntimeMessageId">;
export type RuntimeEventId = OpaqueId<"RuntimeEventId">;
export type LeaseId = OpaqueId<"LeaseId">;
export type RuntimeToolCallId = OpaqueId<"RuntimeToolCallId">;

export type AgentLifecycleState = "active" | "paused";

export type RuntimeMessageState = "queued" | "leased" | "acknowledged" | "dead_lettered";

export type AgentRunState = "queued" | "running" | "suspended" | "completed" | "failed" | "cancelled";

export type RuntimeToolCallState = "queued" | "running" | "completed" | "failed" | "indeterminate";

export type AgentRecord = {
  id: AgentId;
  sessionId: string;
  factoryId?: string;
  state: AgentLifecycleState;
  createdAt: string;
  updatedAt: string;
};

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
  kind: "agent_input";
  input: AgentMessage;
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
  | "agent_paused"
  | "agent_resumed"
  | "agent_recovered"
  | "agent_recovery_failed"
  | "factory_missing"
  | "message_enqueued"
  | "run_enqueued"
  | "run_leased"
  | "lease_expired"
  | "lease_recovered"
  | "run_suspended"
  | "run_retry_scheduled"
  | "run_completed"
  | "run_aborted"
  | "message_acknowledged"
  | "message_dead_lettered"
  | "tool_call_created"
  | "tool_call_started"
  | "tool_call_failed"
  | "tool_call_completed"
  | "tool_call_indeterminate";

export type RuntimeEvent = {
  id: RuntimeEventId;
  sequence: number;
  kind: RuntimeEventKind;
  agentId?: AgentId;
  messageId?: RuntimeMessageId;
  runId?: AgentRunId;
  toolCallId?: RuntimeToolCallId;
  payload?: unknown;
  createdAt: string;
};

export type RuntimeEventCursor = {
  after?: RuntimeEventId;
  limit?: number;
};

export type RuntimeEventCheckpoint = {
  consumerId: string;
  sequence: number;
  eventId?: RuntimeEventId;
  updatedAt: string;
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
