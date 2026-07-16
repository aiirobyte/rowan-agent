import type { AgentMessage, Outcome, ToolResult } from "../protocol";
import type {
  AgentId,
  AgentRecord,
  AgentRunRecord,
  AgentRunId,
  FactoryId,
  RuntimeEvent,
  RuntimeEventId,
  RuntimeMessage,
  RuntimeMessageId,
  RuntimeMessagePayload,
  RuntimeToolCall,
  RuntimeToolCallId,
  RuntimeLease,
} from "./domain";

export type CreateAgentInput = {
  sessionId: string;
  factoryId?: FactoryId;
};

export type EnqueueMessageInput = {
  agentId: AgentId;
  payload: RuntimeMessagePayload;
};

export type EnqueueAgentInput = {
  agentId: AgentId;
  input: AgentMessage;
  parentRunId?: AgentRunId;
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

export type SuspendRunInput = {
  runId: AgentRunId;
  reason?: string;
};

export type CompleteRunInput = {
  runId: AgentRunId;
  outcome: Outcome;
  state?: Extract<AgentRunRecord["state"], "completed" | "failed" | "cancelled">;
};

export type CompleteChildRunInput = CompleteRunInput & {
  parent: {
    agentId: AgentId;
    runId: AgentRunId;
  };
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
  getAgentBySessionId(sessionId: string): Promise<AgentRecord | undefined>;

  enqueueMessage(input: EnqueueMessageInput): Promise<RuntimeMessage>;
  enqueueAgentInput(input: EnqueueAgentInput): Promise<{ message: RuntimeMessage; run: AgentRunRecord }>;
  getMessage(messageId: RuntimeMessageId): Promise<RuntimeMessage | undefined>;
  getRun(runId: AgentRunId): Promise<AgentRunRecord | undefined>;
  leaseRun(input: LeaseRunInput): Promise<LeasedRun>;
  suspendRun(input: SuspendRunInput): Promise<AgentRunRecord>;
  completeRun(input: CompleteRunInput): Promise<AgentRunRecord>;
  completeChildRun(input: CompleteChildRunInput): Promise<{ childRun: AgentRunRecord; message: RuntimeMessage }>;
  abortRun(input: AbortRunInput): Promise<AgentRunRecord>;
  acknowledgeMessage(messageId: RuntimeMessageId): Promise<RuntimeMessage>;
  deadLetterMessage(messageId: RuntimeMessageId, reason: string): Promise<RuntimeMessage>;
  recoverExpiredLeases(now?: Date): Promise<AgentRunRecord[]>;

  createToolCall(input: CreateToolCallInput): Promise<RuntimeToolCall>;
  startToolCall(toolCallId: RuntimeToolCallId): Promise<RuntimeToolCall>;
  completeToolCall(input: CompleteToolCallInput): Promise<RuntimeToolCall>;
  markToolCallIndeterminate(input: IndeterminateToolCallInput): Promise<RuntimeToolCall>;
  getToolCall(toolCallId: RuntimeToolCallId): Promise<RuntimeToolCall | undefined>;

  listEvents(): Promise<RuntimeEvent[]>;
  acknowledgeEvent(eventId: RuntimeEventId): Promise<RuntimeEvent>;
}
