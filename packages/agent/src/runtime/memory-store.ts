import { createId, createTimestamp } from "../utils";
import type {
  AgentId,
  AgentRecord,
  AgentRunRecord,
  AgentRunId,
  LeaseId,
  RuntimeEvent,
  RuntimeEventCheckpoint,
  RuntimeEventId,
  RuntimeEventKind,
  RuntimeLease,
  RuntimeMessage,
  RuntimeMessageId,
  RuntimeToolCall,
  RuntimeToolCallId,
} from "./domain";
import type {
  AcknowledgeEventAndEnqueueAgentInput,
  AcknowledgeEventAndEnqueueAgentInputResult,
  CompleteRunInput,
  ExhaustRunInput,
  CompleteToolCallInput,
  CreateAgentInput,
  CreateToolCallInput,
  EnqueueAgentInput,
  EnqueuedAgentInput,
  IndeterminateToolCallInput,
  LeaseRunInput,
  LeasedRun,
  RuntimeStateStore,
  RetryRunInput,
  RenewLeaseInput,
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
  private readonly eventCheckpoints = new Map<string, RuntimeEventCheckpoint>();

  async createAgent(input: CreateAgentInput): Promise<AgentRecord> {
    const { timestamp } = now();
    const agent: AgentRecord = {
      id: createId("agt") as AgentId,
      sessionId: input.sessionId,
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

  async listAgents(): Promise<AgentRecord[]> {
    return clone([...this.agents.values()]);
  }

  async setAgentState(agentId: AgentId, state: AgentRecord["state"]): Promise<AgentRecord> {
    const agent = this.requireAgent(agentId);
    if (agent.state === state) return clone(agent);
    const { timestamp } = now();
    agent.state = state;
    agent.updatedAt = timestamp;
    this.recordEvent(state === "paused" ? "agent_paused" : "agent_resumed", { agentId });
    return clone(agent);
  }

  async enqueueAgentInput(input: EnqueueAgentInput): Promise<EnqueuedAgentInput> {
    return this.enqueueAgentInputState(input);
  }

  private enqueueAgentInputState(input: EnqueueAgentInput): EnqueuedAgentInput {
    this.requireAgent(input.agentId);
    const suspended = [...this.runs.values()]
      .filter((run) => run.agentId === input.agentId && run.state === "suspended")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    const { timestamp } = now();
    const messageId = createId("rmsg") as RuntimeMessageId;
    const runId = suspended?.id ?? (createId("run") as AgentRunId);
    const message: RuntimeMessage = {
      id: messageId,
      agentId: input.agentId,
      kind: "agent_input",
      input: clone(input.input),
      state: "queued",
      attempts: 0,
      runId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    if (suspended) {
      suspended.state = "queued";
      suspended.messageId = messageId;
      delete suspended.suspensionReason;
      delete suspended.inputRequest;
      suspended.updatedAt = timestamp;
      message.runId = suspended.id;
    }
    const run: AgentRunRecord = {
      id: runId,
      agentId: input.agentId,
      messageId,
      state: "queued",
      attempt: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.messages.set(message.id, message);
    this.runs.set(run.id, suspended ?? run);
    this.recordEvent("message_enqueued", { agentId: input.agentId, messageId });
    this.recordEvent("run_enqueued", { agentId: input.agentId, messageId, runId });
    return { message: clone(message), run: clone(suspended ?? run), resumed: Boolean(suspended) };
  }

  async getMessage(messageId: RuntimeMessageId): Promise<RuntimeMessage | undefined> {
    const message = this.messages.get(messageId);
    return message ? clone(message) : undefined;
  }

  async getRun(runId: AgentRunId): Promise<AgentRunRecord | undefined> {
    const run = this.runs.get(runId);
    return run ? clone(run) : undefined;
  }

  async listRuns(input: import("./store").ListRunsInput = {}): Promise<AgentRunRecord[]> {
    return clone([...this.runs.values()]
      .filter((run) => input.agentId === undefined || run.agentId === input.agentId)
      .filter((run) => !input.states || input.states.includes(run.state))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
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

  async renewLease(input: RenewLeaseInput): Promise<RuntimeLease> {
    const run = this.requireRun(input.runId);
    requireTransition("Agent Run", run.id, run.state, "renew Lease", ["running"]);
    const message = this.requireMessage(run.messageId);
    requireTransition("Runtime Message", message.id, message.state, "renew Lease", ["leased"]);
    if (run.leaseId !== input.leaseId || message.lease?.id !== input.leaseId) {
      throw new Error(`Lease ${input.leaseId} does not own Agent Run ${run.id}.`);
    }
    if (!Number.isFinite(input.leaseDurationMs) || input.leaseDurationMs <= 0) {
      throw new Error("Lease duration must be a positive finite number.");
    }
    const { date, timestamp } = now(input.now);
    const lease: RuntimeLease = {
      ...message.lease,
      expiresAt: createTimestamp(new Date(date.getTime() + input.leaseDurationMs)),
    };
    message.lease = lease;
    message.updatedAt = timestamp;
    return clone(lease);
  }

  async suspendRun(input: SuspendRunInput): Promise<AgentRunRecord> {
    const run = this.requireRun(input.runId);
    requireTransition("Agent Run", run.id, run.state, "suspend", ["running"]);
    const message = this.requireMessage(run.messageId);
    const { timestamp } = now();
    run.state = "suspended";
    run.suspensionReason = input.reason;
    if (input.inputRequest) run.inputRequest = clone(input.inputRequest);
    if (input.executionState) run.executionState = clone(input.executionState);
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
    const message = this.requireMessage(run.messageId);
    requireTransition("Runtime Message", message.id, message.state, "acknowledge", ["leased"]);
    const { timestamp } = now();
    const state = input.state ?? "completed";
    run.state = state;
    run.outcome = clone(input.outcome);
    delete run.inputRequest;
    delete run.executionState;
    delete run.leaseId;
    run.updatedAt = timestamp;
    message.state = "acknowledged";
    delete message.lease;
    message.updatedAt = timestamp;
    this.recordEvent("run_completed", { agentId: run.agentId, messageId: run.messageId, runId: run.id }, {
      state,
      outcome: input.outcome,
    });
    this.recordEvent("message_acknowledged", { agentId: message.agentId, messageId: message.id });
    return clone(run);
  }

  async retryRun(input: RetryRunInput): Promise<AgentRunRecord> {
    const run = this.requireRun(input.runId);
    requireTransition("Agent Run", run.id, run.state, "retry", ["running"]);
    const message = this.requireMessage(run.messageId);
    requireTransition("Runtime Message", message.id, message.state, "retry", ["leased"]);
    const { timestamp } = now();
    run.state = "queued";
    delete run.leaseId;
    run.updatedAt = timestamp;
    message.state = "queued";
    delete message.lease;
    message.updatedAt = timestamp;
    this.recordEvent("run_retry_scheduled", {
      agentId: run.agentId,
      messageId: message.id,
      runId: run.id,
    }, { reason: input.reason, attempt: run.attempt });
    return clone(run);
  }

  async exhaustRun(input: ExhaustRunInput): Promise<AgentRunRecord> {
    const run = this.requireRun(input.runId);
    requireTransition("Agent Run", run.id, run.state, "exhaust retries", ["running"]);
    const message = this.requireMessage(run.messageId);
    requireTransition("Runtime Message", message.id, message.state, "dead-letter", ["leased"]);
    const { timestamp } = now();
    run.state = "failed";
    run.outcome = clone(input.outcome);
    delete run.inputRequest;
    delete run.executionState;
    delete run.leaseId;
    run.updatedAt = timestamp;
    message.state = "dead_lettered";
    message.deadLetterReason = input.reason;
    delete message.lease;
    message.updatedAt = timestamp;
    this.recordEvent("run_completed", { agentId: run.agentId, messageId: message.id, runId: run.id }, {
      state: "failed",
      outcome: input.outcome,
    });
    this.recordEvent("message_dead_lettered", { agentId: run.agentId, messageId: message.id }, {
      reason: input.reason,
    });
    return clone(run);
  }

  async abortRun(input: import("./store").AbortRunInput): Promise<AgentRunRecord> {
    const run = this.requireRun(input.runId);
    requireTransition("Agent Run", run.id, run.state, "abort", ["queued", "running", "suspended"]);
    const message = this.requireMessage(run.messageId);
    const { timestamp } = now();
    run.state = "cancelled";
    run.outcome = clone(input.outcome);
    delete run.inputRequest;
    delete run.executionState;
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

  async recoverLeases(): Promise<AgentRunRecord[]> {
    const { timestamp } = now();
    const recovered: AgentRunRecord[] = [];
    for (const run of this.runs.values()) {
      if (run.state !== "running" || !run.leaseId) continue;
      const message = this.requireMessage(run.messageId);
      if (message.state !== "leased" || !message.lease) continue;
      run.state = "queued";
      delete run.leaseId;
      run.updatedAt = timestamp;
      message.state = "queued";
      delete message.lease;
      message.updatedAt = timestamp;
      this.recordEvent("lease_recovered", { agentId: run.agentId, messageId: message.id, runId: run.id });
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
    const state = input.state ?? (input.result.ok ? "completed" : "failed");
    requireTransition(
      "Tool Call",
      toolCall.id,
      toolCall.state,
      "complete",
      state === "failed" ? ["queued", "running"] : ["running"],
    );
    const { timestamp } = now();
    toolCall.state = state;
    toolCall.result = clone(input.result);
    toolCall.updatedAt = timestamp;
    this.recordEvent(state === "failed" ? "tool_call_failed" : "tool_call_completed", {
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

  async listEvents(cursor: import("./domain").RuntimeEventCursor = {}): Promise<RuntimeEvent[]> {
    let events = this.events;
    if (cursor.after) {
      const index = events.findIndex((event) => event.id === cursor.after);
      if (index >= 0) events = events.slice(index + 1);
    }
    return clone(cursor.limit === undefined ? events : events.slice(0, cursor.limit));
  }

  async recordEvent(
    input: import("./store").RecordRuntimeEventInput | RuntimeEventKind,
    related: Pick<RuntimeEvent, "agentId" | "messageId" | "runId" | "toolCallId"> = {},
    payload?: unknown,
  ): Promise<RuntimeEvent> {
    this.recordEventInternal(typeof input === "string" ? input : input.kind, typeof input === "string" ? related : input.related ?? {}, typeof input === "string" ? payload : input.payload);
    return clone(this.events.at(-1)!);
  }

  async getEventCheckpoint(consumerId: string): Promise<RuntimeEventCheckpoint> {
    return clone(this.eventCheckpoints.get(consumerId) ?? {
      consumerId,
      sequence: 0,
      updatedAt: createTimestamp(new Date(0)),
    });
  }

  async acknowledgeEvent(
    consumerId: string,
    eventId: RuntimeEventId,
  ): Promise<RuntimeEventCheckpoint> {
    const event = this.events.find((candidate) => candidate.id === eventId);
    if (!event) throw new Error(`Runtime Event not found: ${eventId}.`);
    const current = await this.getEventCheckpoint(consumerId);
    if (event.sequence <= current.sequence) return current;
    if (event.sequence !== current.sequence + 1) {
      throw new Error(`Runtime Event Consumer Checkpoint cannot advance from sequence ${current.sequence} to ${event.sequence}.`);
    }
    const checkpoint: RuntimeEventCheckpoint = {
      consumerId,
      sequence: event.sequence,
      eventId: event.id,
      updatedAt: createTimestamp(),
    };
    this.eventCheckpoints.set(consumerId, checkpoint);
    return clone(checkpoint);
  }

  async acknowledgeEventAndEnqueueAgentInput(
    input: AcknowledgeEventAndEnqueueAgentInput,
  ): Promise<AcknowledgeEventAndEnqueueAgentInputResult> {
    const event = this.events.find((candidate) => candidate.id === input.eventId);
    if (!event) throw new Error(`Runtime Event not found: ${input.eventId}.`);
    const current = this.eventCheckpoints.get(input.consumerId) ?? {
      consumerId: input.consumerId,
      sequence: 0,
      updatedAt: createTimestamp(new Date(0)),
    };
    if (event.sequence <= current.sequence) return { checkpoint: clone(current) };
    if (event.sequence !== current.sequence + 1) {
      throw new Error(`Runtime Event Consumer Checkpoint cannot advance from sequence ${current.sequence} to ${event.sequence}.`);
    }
    this.requireAgent(input.agentId);

    const enqueued = this.enqueueAgentInputState(input);
    const checkpoint: RuntimeEventCheckpoint = {
      consumerId: input.consumerId,
      sequence: event.sequence,
      eventId: event.id,
      updatedAt: createTimestamp(),
    };
    this.eventCheckpoints.set(input.consumerId, checkpoint);
    return { checkpoint: clone(checkpoint), enqueued };
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

  private recordEventInternal(
    kind: RuntimeEventKind,
    related: Pick<RuntimeEvent, "agentId" | "messageId" | "runId" | "toolCallId">,
    payload?: unknown,
  ): void {
    this.events.push({
      id: createId("evt") as RuntimeEventId,
      sequence: this.events.length + 1,
      kind,
      ...related,
      ...(payload !== undefined ? { payload: clone(payload) } : {}),
      createdAt: createTimestamp(),
    });
  }
}
