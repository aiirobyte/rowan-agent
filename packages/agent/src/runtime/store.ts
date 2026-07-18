import type { AgentMessage, Outcome, ToolResult } from "../protocol";
import type {
  AgentId,
  AgentRecord,
  AgentRunRecord,
  AgentRunId,
  AgentLifecycleState,
  RuntimeEvent,
  RuntimeEventId,
  RuntimeMessage,
  RuntimeMessageId,
  RuntimeToolCall,
  RuntimeToolCallId,
  RuntimeLease,
  RuntimeEventCursor,
  RuntimeEventCheckpoint,
} from "./domain";

export type CreateAgentInput = {
  sessionId: string;
  factoryId?: string;
};

export type EnqueueAgentInput = {
  agentId: AgentId;
  input: AgentMessage;
};

export type AcknowledgeEventAndEnqueueAgentInput = EnqueueAgentInput & {
  consumerId: string;
  eventId: RuntimeEventId;
};

export type EnqueuedAgentInput = {
  message: RuntimeMessage;
  run: AgentRunRecord;
  resumed: boolean;
};

export type AcknowledgeEventAndEnqueueAgentInputResult = {
  checkpoint: RuntimeEventCheckpoint;
  enqueued?: EnqueuedAgentInput;
};

export type ListRunsInput = {
  agentId?: AgentId;
  states?: AgentRunRecord["state"][];
};

export type RecordRuntimeEventInput = {
  kind: import("./domain").RuntimeEventKind;
  related?: Pick<import("./domain").RuntimeEvent, "agentId" | "messageId" | "runId" | "toolCallId">;
  payload?: unknown;
};

export type LeaseRunInput = {
  runId: AgentRunId;
  workerId: string;
  leaseDurationMs: number;
  now?: Date;
};

export type LeasedRun = {
  run: AgentRunRecord;
  message: RuntimeMessage;
  lease: RuntimeLease;
};

export type RenewLeaseInput = {
  runId: AgentRunId;
  leaseId: import("./domain").LeaseId;
  leaseDurationMs: number;
  now?: Date;
};

export type SuspendRunInput = {
  runId: AgentRunId;
  reason?: string;
};

export type CompleteRunInput = {
  runId: AgentRunId;
  outcome: Outcome;
  state?: Extract<AgentRunRecord["state"], "completed" | "failed" | "cancelled">;
};

export type RetryRunInput = {
  runId: AgentRunId;
  reason: string;
};

export type ExhaustRunInput = {
  runId: AgentRunId;
  outcome: Outcome;
  reason: string;
};

export type AbortRunInput = {
  runId: AgentRunId;
  outcome: Outcome;
};

export type CreateToolCallInput = {
  agentId: AgentId;
  runId: AgentRunId;
  name: string;
  args: unknown;
};

export type CompleteToolCallInput = {
  toolCallId: RuntimeToolCallId;
  result: ToolResult;
  state?: Extract<RuntimeToolCall["state"], "completed" | "failed">;
};

export type IndeterminateToolCallInput = {
  toolCallId: RuntimeToolCallId;
  reason: string;
};

export interface RuntimeStateStore {
  createAgent(input: CreateAgentInput): Promise<AgentRecord>;
  getAgent(agentId: AgentId): Promise<AgentRecord | undefined>;
  listAgents(): Promise<AgentRecord[]>;
  setAgentState(agentId: AgentId, state: AgentLifecycleState): Promise<AgentRecord>;

  enqueueAgentInput(input: EnqueueAgentInput): Promise<EnqueuedAgentInput>;
  getMessage(messageId: RuntimeMessageId): Promise<RuntimeMessage | undefined>;
  getRun(runId: AgentRunId): Promise<AgentRunRecord | undefined>;
  listRuns(input?: ListRunsInput): Promise<AgentRunRecord[]>;
  leaseRun(input: LeaseRunInput): Promise<LeasedRun>;
  renewLease(input: RenewLeaseInput): Promise<RuntimeLease>;
  suspendRun(input: SuspendRunInput): Promise<AgentRunRecord>;
  completeRun(input: CompleteRunInput): Promise<AgentRunRecord>;
  retryRun(input: RetryRunInput): Promise<AgentRunRecord>;
  exhaustRun(input: ExhaustRunInput): Promise<AgentRunRecord>;
  abortRun(input: AbortRunInput): Promise<AgentRunRecord>;
  recoverExpiredLeases(now?: Date): Promise<AgentRunRecord[]>;
  recoverLeases(): Promise<AgentRunRecord[]>;

  createToolCall(input: CreateToolCallInput): Promise<RuntimeToolCall>;
  startToolCall(toolCallId: RuntimeToolCallId): Promise<RuntimeToolCall>;
  completeToolCall(input: CompleteToolCallInput): Promise<RuntimeToolCall>;
  markToolCallIndeterminate(input: IndeterminateToolCallInput): Promise<RuntimeToolCall>;
  getToolCall(toolCallId: RuntimeToolCallId): Promise<RuntimeToolCall | undefined>;

  listEvents(cursor?: RuntimeEventCursor): Promise<RuntimeEvent[]>;
  recordEvent(input: RecordRuntimeEventInput): Promise<RuntimeEvent>;
  getEventCheckpoint(consumerId: string): Promise<RuntimeEventCheckpoint>;
  acknowledgeEvent(consumerId: string, eventId: RuntimeEventId): Promise<RuntimeEventCheckpoint>;
  acknowledgeEventAndEnqueueAgentInput(
    input: AcknowledgeEventAndEnqueueAgentInput,
  ): Promise<AcknowledgeEventAndEnqueueAgentInputResult>;
}
