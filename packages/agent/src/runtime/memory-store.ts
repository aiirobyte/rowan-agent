import { createId, createTimestamp } from "../utils";
import type {
  AgentId,
  AgentRecord,
  AgentRunRecord,
  AgentRunId,
  LeaseId,
  RuntimeEvent,
  RuntimeEventId,
  RuntimeEventKind,
  RuntimeLease,
  RuntimeMessage,
  RuntimeMessageId,
  RuntimeMessagePayload,
  RuntimeToolCall,
  RuntimeToolCallId,
} from "./domain";
import type {
  CompleteRunInput,
  CompleteToolCallInput,
  CreateAgentInput,
  CreateToolCallInput,
  EnqueueAgentInput,
  EnqueueMessageInput,
  IndeterminateToolCallInput,
  LeaseRunInput,
  LeasedRun,
  RuntimeStateStore,
  SuspendRunInput,
} from "./store";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function transitionError(entity: string, id: string, state: string, action: string): Error {
  return new Error(`Cannot ${action} ${entity} ${id} from state "${state}".`);
}

function requireTransition(
  entity: string,
  id: string,
  state: string,
  action: string,
  allowedStates: readonly string[],
): void {
  if (!allowedStates.includes(state)) {
    throw transitionError(entity, id, state, action);
  }
}

function now(input?: Date): { date: Date; timestamp: string } {
  const date = input ? new Date(input) : new Date();
  return { date, timestamp: createTimestamp(date) };
}

export class InMemoryRuntimeStateStore implements RuntimeStateStore {
  private readonly agents = new Map<AgentId, AgentRecord>();
  private readonly messages = new Map<RuntimeMessageId, RuntimeMessage>();
  private readonly runs = new Map<AgentRunId, AgentRunRecord>();
  private readonly toolCalls = new Map<RuntimeToolCallId, RuntimeToolCall>();
  private readonly events: RuntimeEvent[] = [];

  async createAgent(input: CreateAgentInput): Promise<AgentRecord> {
    const { timestamp } = now();
    const agent: AgentRecord = {
      id: createId("agt") as AgentId,
      sessionId: input.sessionId,
      ...(input.factoryId ? { factoryId: input.factoryId } : {}),
      state: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.agents.set(agent.id, agent);
    this.recordEvent("agent_created", { agentId: agent.id });
    return clone(agent);
  }

  async getAgent(agentId: AgentId): Promise<AgentRecord | undefined> {
    const agent = this.agents.get(agentId);
    return agent ? clone(agent) : undefined;
  }

  async getAgentBySessionId(sessionId: string): Promise<AgentRecord | undefined> {
    const agent = [...this.agents.values()].find((candidate) => candidate.sessionId === sessionId);
    return agent ? clone(agent) : undefined;
  }

  async enqueueMessage(input: EnqueueMessageInput): Promise<RuntimeMessage> {
    this.requireAgent(input.agentId);
    const { timestamp } = now();
    const message: RuntimeMessage = {
      id: createId("rmsg") as RuntimeMessageId,
      agentId: input.agentId,
      kind: input.payload.type,
      payload: clone(input.payload),
      state: "queued",
      attempts: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.messages.set(message.id, message);
    this.recordEvent("message_enqueued", { agentId: message.agentId, messageId: message.id });
    return clone(message);
  }

  async enqueueAgentInput(input: EnqueueAgentInput): Promise<{ message: RuntimeMessage; run: AgentRunRecord }> {
    this.requireAgent(input.agentId);
    const { timestamp } = now();
    const messageId = createId("rmsg") as RuntimeMessageId;
    const runId = createId("run") as AgentRunId;
    const message: RuntimeMessage = {
      id: messageId,
      agentId: input.agentId,
      kind: "agent_input",
      payload: { type: "agent_input", input: clone(input.input) },
      state: "queued",
      attempts: 0,
      runId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const run: AgentRunRecord = {
      id: runId,
      agentId: input.agentId,
      messageId,
      ...(input.parentRunId ? { parentRunId: input.parentRunId } : {}),
      state: "queued",
      attempt: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.messages.set(message.id, message);
    this.runs.set(run.id, run);
    this.recordEvent("message_enqueued", { agentId: input.agentId, messageId });
    this.recordEvent("run_enqueued", { agentId: input.agentId, messageId, runId });
    return { message: clone(message), run: clone(run) };
  }

  async getMessage(messageId: RuntimeMessageId): Promise<RuntimeMessage | undefined> {
    const message = this.messages.get(messageId);
    return message ? clone(message) : undefined;
  }

  async getRun(runId: AgentRunId): Promise<AgentRunRecord | undefined> {
    const run = this.runs.get(runId);
    return run ? clone(run) : undefined;
  }

  async leaseRun(input: LeaseRunInput): Promise<LeasedRun> {
    const run = this.requireRun(input.runId);
    requireTransition("Agent Run", run.id, run.state, "lease", ["queued"]);
    const message = this.requireMessage(run.messageId);
    requireTransition("Runtime Message", message.id, message.state, "lease", ["queued"]);
    const agent = this.requireAgent(run.agentId);
    if (agent.state !== "active") {
      throw transitionError("Agent", agent.id, agent.state, "lease a Run for");
    }
    if ([...this.runs.values()].some((candidate) =>
      candidate.agentId === run.agentId &&
      candidate.id !== run.id &&
      (candidate.state === "running" || candidate.state === "suspended")
    )) {
      throw new Error(`Agent ${run.agentId} already has an active Run.`);
    }
    if (!Number.isFinite(input.leaseDurationMs) || input.leaseDurationMs <= 0) {
      throw new Error("Lease duration must be a positive finite number.");
    }

    const { date, timestamp } = now(input.now);
    const lease: RuntimeLease = {
      id: createId("lease") as LeaseId,
      runId: run.id,
      workerId: input.workerId,
      leasedAt: timestamp,
      expiresAt: createTimestamp(new Date(date.getTime() + input.leaseDurationMs)),
    };
    run.state = "running";
    run.attempt += 1;
    run.leaseId = lease.id;
    run.updatedAt = timestamp;
    message.state = "leased";
    message.attempts += 1;
    message.lease = lease;
    message.updatedAt = timestamp;
    this.recordEvent("run_leased", { agentId: run.agentId, messageId: message.id, runId: run.id }, lease);
    return { run: clone(run), message: clone(message), lease: clone(lease) };
  }

  async suspendRun(input: SuspendRunInput): Promise<AgentRunRecord> {
    const run = this.requireRun(input.runId);
    requireTransition("Agent Run", run.id, run.state, "suspend", ["running"]);
    const message = this.requireMessage(run.messageId);
    const { timestamp } = now();
    run.state = "suspended";
    run.suspensionReason = input.reason;
    delete run.leaseId;
    run.updatedAt = timestamp;
    requireTransition("Runtime Message", message.id, message.state, "acknowledge", ["leased"]);
    message.state = "acknowledged";
    delete message.lease;
    message.updatedAt = timestamp;
    this.recordEvent("run_suspended", { agentId: run.agentId, messageId: message.id, runId: run.id }, {
      reason: input.reason,
    });
    return clone(run);
  }

  async completeRun(input: CompleteRunInput): Promise<AgentRunRecord> {
    const run = this.requireRun(input.runId);
    requireTransition("Agent Run", run.id, run.state, "complete", ["running"]);
    const { timestamp } = now();
    const state = input.state ?? "completed";
    run.state = state;
    run.outcome = clone(input.outcome);
    delete run.leaseId;
    run.updatedAt = timestamp;
    this.recordEvent("run_completed", { agentId: run.agentId, messageId: run.messageId, runId: run.id }, {
      state,
      outcome: input.outcome,
    });
    return clone(run);
  }

  async completeChildRun(input: import("./store").CompleteChildRunInput): Promise<{
    childRun: AgentRunRecord;
    message: RuntimeMessage;
  }> {
    const childRun = this.requireRun(input.runId);
    requireTransition("Agent Run", childRun.id, childRun.state, "complete", ["running"]);
    const parentAgent = this.requireAgent(input.parent.agentId);
    const parentRun = this.requireRun(input.parent.runId);
    if (parentRun.agentId !== parentAgent.id) {
      throw new Error(`Parent Run ${parentRun.id} does not belong to Agent ${parentAgent.id}.`);
    }
    if (childRun.parentRunId && childRun.parentRunId !== parentRun.id) {
      throw new Error(`Child Run ${childRun.id} is already correlated to Parent Run ${childRun.parentRunId}.`);
    }
    const childMessage = this.requireMessage(childRun.messageId);
    requireTransition("Runtime Message", childMessage.id, childMessage.state, "acknowledge", ["leased"]);
    const { timestamp } = now();
    const messageId = createId("rmsg") as RuntimeMessageId;
    const message: RuntimeMessage = {
      id: messageId,
      agentId: parentAgent.id,
      kind: "child_run_completion",
      payload: {
        type: "child_run_completion",
        childAgentId: childRun.agentId,
        childRunId: childRun.id,
        parentRunId: parentRun.id,
        outcome: clone(input.outcome),
      },
      state: "queued",
      attempts: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    childRun.state = input.state ?? "completed";
    childRun.parentRunId = parentRun.id;
    childRun.outcome = clone(input.outcome);
    delete childRun.leaseId;
    childRun.updatedAt = timestamp;
    childMessage.state = "acknowledged";
    delete childMessage.lease;
    childMessage.updatedAt = timestamp;
    this.messages.set(message.id, message);
    this.recordEvent("run_completed", {
      agentId: childRun.agentId,
      messageId: childMessage.id,
      runId: childRun.id,
    }, { state: childRun.state, outcome: input.outcome });
    this.recordEvent("message_enqueued", { agentId: parentAgent.id, messageId: message.id }, message.payload);
    return { childRun: clone(childRun), message: clone(message) };
  }

  async abortRun(input: import("./store").AbortRunInput): Promise<AgentRunRecord> {
    const run = this.requireRun(input.runId);
    requireTransition("Agent Run", run.id, run.state, "abort", ["queued", "running", "suspended"]);
    const message = this.requireMessage(run.messageId);
    const { timestamp } = now();
    run.state = "cancelled";
    run.outcome = clone(input.outcome);
    delete run.leaseId;
    run.updatedAt = timestamp;
    if (message.state === "queued" || message.state === "leased") {
      message.state = "acknowledged";
      delete message.lease;
      message.updatedAt = timestamp;
    }
    this.recordEvent("run_aborted", { agentId: run.agentId, messageId: message.id, runId: run.id }, {
      outcome: input.outcome,
    });
    return clone(run);
  }

  async acknowledgeMessage(messageId: RuntimeMessageId): Promise<RuntimeMessage> {
    const message = this.requireMessage(messageId);
    requireTransition("Runtime Message", message.id, message.state, "acknowledge", ["queued", "leased"]);
    if (message.runId) {
      const run = this.requireRun(message.runId);
      if (!["suspended", "completed", "failed", "cancelled"].includes(run.state)) {
        throw new Error(`Cannot acknowledge Runtime Message ${message.id} while its Run is ${run.state}.`);
      }
    }
    const { timestamp } = now();
    message.state = "acknowledged";
    delete message.lease;
    message.updatedAt = timestamp;
    this.recordEvent("message_acknowledged", { agentId: message.agentId, messageId: message.id });
    return clone(message);
  }

  async deadLetterMessage(messageId: RuntimeMessageId, reason: string): Promise<RuntimeMessage> {
    const message = this.requireMessage(messageId);
    requireTransition("Runtime Message", message.id, message.state, "dead-letter", ["queued", "leased"]);
    if (message.runId) {
      const run = this.requireRun(message.runId);
      if (run.state !== "queued") {
        throw new Error(`Cannot dead-letter Runtime Message ${message.id} while its Run is ${run.state}.`);
      }
    }
    const { timestamp } = now();
    message.state = "dead_lettered";
    message.deadLetterReason = reason;
    delete message.lease;
    message.updatedAt = timestamp;
    this.recordEvent("message_dead_lettered", { agentId: message.agentId, messageId: message.id }, { reason });
    return clone(message);
  }

  async recoverExpiredLeases(input?: Date): Promise<AgentRunRecord[]> {
    const { date, timestamp } = now(input);
    const recovered: AgentRunRecord[] = [];
    for (const run of this.runs.values()) {
      if (run.state !== "running" || !run.leaseId) continue;
      const message = this.requireMessage(run.messageId);
      if (message.state !== "leased" || !message.lease || Date.parse(message.lease.expiresAt) > date.getTime()) continue;
      run.state = "queued";
      delete run.leaseId;
      run.updatedAt = timestamp;
      message.state = "queued";
      delete message.lease;
      message.updatedAt = timestamp;
      this.recordEvent("lease_expired", { agentId: run.agentId, messageId: message.id, runId: run.id });
      recovered.push(clone(run));
    }
    return recovered;
  }

  async createToolCall(input: CreateToolCallInput): Promise<RuntimeToolCall> {
    this.requireAgent(input.agentId);
    this.requireRun(input.runId);
    const { timestamp } = now();
    const toolCall: RuntimeToolCall = {
      id: createId("call") as RuntimeToolCallId,
      agentId: input.agentId,
      runId: input.runId,
      name: input.name,
      args: clone(input.args),
      state: "queued",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.toolCalls.set(toolCall.id, toolCall);
    this.recordEvent("tool_call_created", { agentId: input.agentId, runId: input.runId, toolCallId: toolCall.id });
    return clone(toolCall);
  }

  async startToolCall(toolCallId: RuntimeToolCallId): Promise<RuntimeToolCall> {
    const toolCall = this.requireToolCall(toolCallId);
    requireTransition("Tool Call", toolCall.id, toolCall.state, "start", ["queued"]);
    const { timestamp } = now();
    toolCall.state = "running";
    toolCall.updatedAt = timestamp;
    this.recordEvent("tool_call_started", { agentId: toolCall.agentId, runId: toolCall.runId, toolCallId: toolCall.id });
    return clone(toolCall);
  }

  async completeToolCall(input: CompleteToolCallInput): Promise<RuntimeToolCall> {
    const toolCall = this.requireToolCall(input.toolCallId);
    requireTransition("Tool Call", toolCall.id, toolCall.state, "complete", ["running"]);
    const { timestamp } = now();
    toolCall.state = input.state ?? (input.result.ok ? "completed" : "failed");
    toolCall.result = clone(input.result);
    toolCall.updatedAt = timestamp;
    this.recordEvent("tool_call_completed", {
      agentId: toolCall.agentId,
      runId: toolCall.runId,
      toolCallId: toolCall.id,
    }, { state: toolCall.state });
    return clone(toolCall);
  }

  async markToolCallIndeterminate(input: IndeterminateToolCallInput): Promise<RuntimeToolCall> {
    const toolCall = this.requireToolCall(input.toolCallId);
    requireTransition("Tool Call", toolCall.id, toolCall.state, "mark indeterminate", ["running"]);
    const { timestamp } = now();
    toolCall.state = "indeterminate";
    toolCall.indeterminateReason = input.reason;
    toolCall.updatedAt = timestamp;
    this.recordEvent("tool_call_indeterminate", {
      agentId: toolCall.agentId,
      runId: toolCall.runId,
      toolCallId: toolCall.id,
    }, { reason: input.reason });
    return clone(toolCall);
  }

  async getToolCall(toolCallId: RuntimeToolCallId): Promise<RuntimeToolCall | undefined> {
    const toolCall = this.toolCalls.get(toolCallId);
    return toolCall ? clone(toolCall) : undefined;
  }

  async listEvents(): Promise<RuntimeEvent[]> {
    return clone(this.events);
  }

  async acknowledgeEvent(eventId: RuntimeEventId): Promise<RuntimeEvent> {
    const event = this.events.find((candidate) => candidate.id === eventId);
    if (!event) {
      throw new Error(`Runtime Event not found: ${eventId}.`);
    }
    requireTransition("Runtime Event", event.id, event.state, "acknowledge", ["pending"]);
    event.state = "acknowledged";
    return clone(event);
  }

  private requireAgent(agentId: AgentId): AgentRecord {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}.`);
    }
    return agent;
  }

  private requireMessage(messageId: RuntimeMessageId): RuntimeMessage {
    const message = this.messages.get(messageId);
    if (!message) {
      throw new Error(`Runtime Message not found: ${messageId}.`);
    }
    return message;
  }

  private requireRun(runId: AgentRunId): AgentRunRecord {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`Agent Run not found: ${runId}.`);
    }
    return run;
  }

  private requireToolCall(toolCallId: RuntimeToolCallId): RuntimeToolCall {
    const toolCall = this.toolCalls.get(toolCallId);
    if (!toolCall) {
      throw new Error(`Tool Call not found: ${toolCallId}.`);
    }
    return toolCall;
  }

  private recordEvent(
    kind: RuntimeEventKind,
    related: Pick<RuntimeEvent, "agentId" | "messageId" | "runId" | "toolCallId">,
    payload?: unknown,
  ): void {
    this.events.push({
      id: createId("evt") as RuntimeEventId,
      kind,
      state: "pending",
      ...related,
      ...(payload !== undefined ? { payload: clone(payload) } : {}),
      createdAt: createTimestamp(),
    });
  }
}
