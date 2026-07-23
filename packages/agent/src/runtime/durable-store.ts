import { createId, createTimestamp } from "../utils";
import type {
  AgentId,
  AgentRecord,
  AssistantMessage,
  ConsumerRegistration,
  ConfigToken,
  DurableEventBase,
  DurableRunEvent,
  ExecutionCheckpoint,
  ExecutionId,
  ExecutionToken,
  EventCursor,
  InputRequestId,
  InputRequiredCommit,
  Message,
  MessageCommitted,
  MessageId,
  Metadata,
  Outcome,
  OwnerLease,
  OwnerToken,
  RunClaim,
  RunFailure,
  RunId,
  RunRecord,
  RunSnapshot,
  RunState,
  ToolCommit,
  RunTransitioned,
  UserInput,
} from "./contracts";
import type { DurableStore, OwnedStore } from "./contracts";
import { assertToolExecutionResult } from "./contracts";
import { RuntimeError } from "./errors";
import { createIdempotencyScope, encodeIdempotencyScope, canonicalStartRunRequest } from "./idempotency";
import { TOOL_VALUE_JSON_BYTES } from "./idempotency";
import { assertUtf8ByteLimit, canonicalJson } from "./json";
import { normalizeUserInput } from "./contracts";
import type {
  DurableToolResult,
  EventId,
  ToolCallId,
  ToolCallSnapshot,
  ToolExecutionResult,
  ToolStateChanged,
  UserContent,
} from "../runtime-events";

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };
type StoredAgent = Mutable<AgentRecord>;
type StoredRun = Mutable<RunRecord>;
type StoredOwner = Mutable<OwnerLease>;
type StoredToolCall = {
  id: ToolCallId;
  agentId: AgentId;
  runId: RunId;
  executionId: ExecutionId;
  requestMessageId: MessageId;
  name: string;
  args: import("../runtime-events").JsonValue;
  state: import("../runtime-events").ToolCallState;
  result?: DurableToolResult;
  resultMessageId?: MessageId;
  reason?: string;
  createdAt: string;
  updatedAt: string;
};

type IdempotencyReceipt = {
  payload: string;
  result: unknown;
};

export type InMemoryStoreState = Readonly<{
  incarnation: string;
  agents: readonly AgentRecord[];
  runs: readonly RunRecord[];
  messages: readonly Message[];
  toolCalls: readonly ToolCallSnapshot[];
  events: readonly DurableRunEvent[];
  idempotency: readonly (readonly [string, IdempotencyReceipt])[];
  operationReceipts: readonly (readonly [string, IdempotencyReceipt])[];
  consumerCheckpoints: readonly (readonly [string, EventCursor])[];
  nextAgentSequence: readonly (readonly [AgentId, number])[];
  nextReadySequence: readonly (readonly [AgentId, number])[];
  eventSequence: number;
}>;

export class InMemoryStore implements DurableStore {
  private readonly incarnation: string;
  private readonly agents = new Map<AgentId, StoredAgent>();
  private readonly runs = new Map<RunId, StoredRun>();
  private readonly messages = new Map<MessageId, Message>();
  private readonly toolCalls = new Map<ToolCallId, StoredToolCall>();
  private readonly events: DurableRunEvent[] = [];
  private readonly idempotency = new Map<string, IdempotencyReceipt>();
  private readonly operationReceipts = new Map<string, IdempotencyReceipt>();
  private readonly consumerCheckpoints = new Map<string, EventCursor>();
  private readonly nextAgentSequence = new Map<AgentId, number>();
  private readonly nextReadySequence = new Map<AgentId, number>();
  private owner?: StoredOwner;
  private ownerEpoch = 0;
  private eventSequence = 0;

  constructor(options: { incarnation?: string } = {}) {
    this.incarnation = options.incarnation ?? createId("store");
  }

  static fromState(state: InMemoryStoreState): InMemoryStore {
    const store = new InMemoryStore({ incarnation: state.incarnation });
    for (const agent of state.agents) store.agents.set(agent.id, clone(agent));
    for (const run of state.runs) store.runs.set(run.id, clone(run));
    for (const message of state.messages) store.messages.set(message.id, clone(message));
    for (const toolCall of state.toolCalls ?? []) store.toolCalls.set(toolCall.id, clone(toolCall));
    store.events.push(...clone(state.events));
    for (const [key, receipt] of state.idempotency) store.idempotency.set(key, clone(receipt));
    for (const [key, receipt] of state.operationReceipts) store.operationReceipts.set(key, clone(receipt));
    for (const [consumerId, cursor] of state.consumerCheckpoints ?? []) store.consumerCheckpoints.set(consumerId, cursor);
    for (const [agentId, sequence] of state.nextAgentSequence) store.nextAgentSequence.set(agentId, sequence);
    for (const [agentId, sequence] of state.nextReadySequence) store.nextReadySequence.set(agentId, sequence);
    store.eventSequence = state.eventSequence;
    store.ownerEpoch = Math.max(
      0,
      ...state.runs.map((run) => run.execution?.ownerEpoch ?? 0),
    );
    return store;
  }

  exportState(): InMemoryStoreState {
    return clone({
      incarnation: this.incarnation,
      agents: [...this.agents.values()],
      runs: [...this.runs.values()],
      messages: [...this.messages.values()],
      toolCalls: [...this.toolCalls.values()] as unknown as ToolCallSnapshot[],
      events: this.events,
      idempotency: [...this.idempotency.entries()],
      operationReceipts: [...this.operationReceipts.entries()],
      consumerCheckpoints: [...this.consumerCheckpoints.entries()],
      nextAgentSequence: [...this.nextAgentSequence.entries()],
      nextReadySequence: [...this.nextReadySequence.entries()],
      eventSequence: this.eventSequence,
    });
  }

  attachOwner(lease: OwnerLease): void {
    this.owner = clone(lease);
    this.ownerEpoch = Math.max(this.ownerEpoch, lease.epoch);
  }

  interruptOwner(ownerEpoch: number, message = "The previous Runtime owner expired or closed."): void {
    this.ownerEpoch = Math.max(this.ownerEpoch, ownerEpoch);
    for (const run of this.runs.values()) {
      if (run.state !== "running" || run.execution?.ownerEpoch !== ownerEpoch) continue;
      const activeToolCalls = [...this.toolCalls.values()]
        .filter((toolCall) => toolCall.runId === run.id && toolCall.executionId === run.execution?.executionId && (toolCall.state === "pending" || toolCall.state === "running"));
      const indeterminateToolCallIds: ToolCallId[] = [];
      for (const toolCall of activeToolCalls) {
        if (toolCall.state === "running") indeterminateToolCallIds.push(toolCall.id);
        this.interruptToolCall(run, toolCall, message);
      }
      const failure: RunFailure = indeterminateToolCallIds.length > 0
        ? { code: "tool_indeterminate", message, toolCallIds: indeterminateToolCallIds as [ToolCallId, ...ToolCallId[]] }
        : { code: "runtime_interrupted", message, ownerEpoch };
      run.state = "failed";
      run.failure = failure;
      delete run.execution;
      run.revision += 1;
      run.updatedAt = createTimestamp();
      this.appendTransition(run, "running", "failed", undefined, undefined, undefined, failure);
    }
  }

  async openOwner(input: { ownerId: string; leaseMs: number }): Promise<OwnedStore> {
    if (!input.ownerId) throw new TypeError("ownerId must be non-empty");
    assertLeaseDuration(input.leaseMs);
    if (this.owner && Date.parse(this.owner.expiresAt) > Date.now()) {
      if (this.owner.ownerId !== input.ownerId) {
        throw new RuntimeError("runtime_already_owned", {
          expiresAt: this.owner.expiresAt,
          retryAfterMs: Math.max(1, Date.parse(this.owner.expiresAt) - Date.now()),
        });
      }
      this.owner.expiresAt = expiry(input.leaseMs);
      return new MemoryOwnedStore(this, clone(this.owner));
    }

    if (this.owner) this.interruptOwner(this.owner.epoch);
    this.ownerEpoch += 1;
    this.owner = {
      ownerId: input.ownerId,
      token: `${this.incarnation}:${this.ownerEpoch}:${input.ownerId}` as OwnerToken,
      epoch: this.ownerEpoch,
      expiresAt: expiry(input.leaseMs),
    };
    return new MemoryOwnedStore(this, clone(this.owner));
  }

  assertOwner(lease: OwnerLease): void {
    const actual = this.owner;
    if (!actual || actual.token !== lease.token || actual.epoch !== lease.epoch || actual.ownerId !== lease.ownerId) {
      throw ownershipLost(lease, actual, "epoch_advanced");
    }
    if (Date.parse(actual.expiresAt) <= Date.now()) {
      throw ownershipLost(lease, actual, "expired");
    }
  }

  renewOwner(lease: OwnerLease, leaseMs: number): OwnerLease {
    this.assertOwner(lease);
    assertLeaseDuration(leaseMs);
    this.owner!.expiresAt = expiry(leaseMs);
    return clone(this.owner!);
  }

  releaseOwner(lease: OwnerLease): void {
    this.assertOwner(lease);
    this.owner = undefined;
  }

  reserveAgent(lease: OwnerLease, input: { idempotencyKey: string; metadata?: Metadata; configIdentity?: string }): AgentRecord {
    this.assertOwner(lease);
    const scope = createIdempotencyScope("create_agent", input.idempotencyKey);
    const payload = canonicalJson({
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
      ...(input.configIdentity === undefined ? {} : { configIdentity: input.configIdentity }),
    } as never);
    const replay = this.replay(scope, payload);
    if (replay) return clone(replay as AgentRecord);

    const timestamp = createTimestamp();
    const agent: StoredAgent = {
      id: createId("agt") as AgentId,
      ...(input.metadata ? { metadata: clone(input.metadata) } : {}),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.agents.set(agent.id, agent);
    this.nextAgentSequence.set(agent.id, 0);
    this.nextReadySequence.set(agent.id, 0);
    this.writeReceipt(scope, payload, agent);
    return clone(agent);
  }

  activateAgent(lease: OwnerLease, agentId: AgentId, configToken?: ConfigToken, configIdentity?: string): AgentRecord {
    this.assertOwner(lease);
    const agent = this.requireAgent(agentId);
    if (!agent.activatedAt) agent.activatedAt = createTimestamp();
    if (configToken !== undefined) agent.currentConfigToken = configToken;
    if (configIdentity !== undefined) agent.currentConfigIdentity = configIdentity;
    agent.updatedAt = createTimestamp();
    return clone(agent);
  }

  updateAgentConfigToken(lease: OwnerLease, input: { agentId: AgentId; token: ConfigToken; configIdentity?: string; idempotencyKey: string }): AgentRecord {
    this.assertOwner(lease);
    const agent = this.requireAgent(input.agentId);
    const scope = createIdempotencyScope("update_agent_config", input.agentId, input.idempotencyKey);
    const payload = String(input.token);
    const replay = this.replay(scope, payload);
    if (replay) return clone(replay as AgentRecord);
    agent.currentConfigToken = input.token;
    if (input.configIdentity !== undefined) agent.currentConfigIdentity = input.configIdentity;
    agent.updatedAt = createTimestamp();
    this.writeReceipt(scope, payload, agent);
    return clone(agent);
  }

  createRun(lease: OwnerLease, input: { agentId: AgentId; input: UserInput; metadata?: Metadata; idempotencyKey: string }): RunRecord {
    this.assertOwner(lease);
    this.requireAgent(input.agentId);
    const normalizedInput = normalizeUserInput(input.input);
    const scope = createIdempotencyScope("start_run", input.agentId, input.idempotencyKey);
    const payload = canonicalStartRunRequest(normalizedInput, input.metadata);
    const replay = this.replay(scope, payload);
    if (replay) return clone(replay as RunRecord);

    const timestamp = createTimestamp();
    const run: StoredRun = {
      id: createId("run") as RunId,
      agentId: input.agentId,
      agentSequence: this.nextSequence(input.agentId),
      readySequence: this.nextReady(input.agentId),
      revision: 0,
      state: "queued",
      input: clone(normalizedInput),
      ...(input.metadata ? { metadata: clone(input.metadata) } : {}),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.runs.set(run.id, run);
    this.appendTransition(run, null, "queued");
    this.writeReceipt(scope, payload, run);
    return clone(run);
  }

  claimRun(lease: OwnerLease, input: { runId: RunId; expectedRevision: number; executionId?: ExecutionId; messageId?: MessageId; configToken?: ConfigToken }): RunClaim {
    this.assertOwner(lease);
    const executionId = input.executionId ?? (createId("exec") as ExecutionId);
    const operationKey = `claim:${executionId}`;
    const operationPayload = canonicalJson([input.runId, input.expectedRevision, input.messageId ?? null, input.configToken ?? null] as never);
    const replay = this.replayOperation(operationKey, operationPayload);
    if (replay) return clone(replay as RunClaim);
    const run = this.requireRun(input.runId);
    this.assertRevision(run, input.expectedRevision);
    this.assertState(run, ["queued"]);
    if ([...this.runs.values()].some((candidate) => candidate.agentId === run.agentId && candidate.id !== run.id && candidate.agentSequence < run.agentSequence && !["completed", "failed", "cancelled"].includes(candidate.state))) {
      throw new RuntimeError("run_state_conflict", { runId: run.id, expected: ["queued"], actual: run.state });
    }
    if ([...this.runs.values()].some((candidate) => candidate.agentId === run.agentId && candidate.id !== run.id && ["running", "input_required"].includes(candidate.state))) {
      throw new RuntimeError("run_state_conflict", { runId: run.id, expected: ["queued"], actual: run.state });
    }

    const messageId = input.messageId ?? (createId("msg") as MessageId);
    if (run.pinnedConfigToken && input.configToken && run.pinnedConfigToken !== input.configToken) {
      throw new RuntimeError("run_state_conflict", { runId: run.id, expected: ["queued"], actual: run.state });
    }
    if (!run.pinnedConfigToken && input.configToken) run.pinnedConfigToken = input.configToken;
    const userInput = normalizeUserInput(run.input);
    const message: Message = {
      id: messageId,
      agentId: run.agentId,
      runId: run.id,
      role: "user",
      content: userInputContent(userInput),
      ...(userInputMetadata(userInput) ? { metadata: clone(userInputMetadata(userInput)!) } : {}),
      sequenceWithinRun: this.nextMessageSequence(run.id),
      createdAt: createTimestamp(),
    };
    this.messages.set(message.id, message);
    const execution: ExecutionToken = {
      runId: run.id,
      ownerEpoch: lease.epoch,
      executionId,
    };
    run.state = "running";
    run.execution = execution;
    run.revision += 1;
    run.updatedAt = createTimestamp();
    this.appendMessage(run, message);
    this.appendTransition(run, "queued", "running");
    const result = { run: clone(run), execution: clone(execution), history: this.history(run.agentId, run.agentSequence) };
    this.writeOperationReceipt(operationKey, operationPayload, result);
    return result;
  }

  failQueuedRun(lease: OwnerLease, input: { runId: RunId; expectedRevision: number; failure: Extract<RunFailure, { code: "configuration_unavailable" | "checkpoint_incompatible" }> }): RunRecord {
    this.assertOwner(lease);
    const operationKey = `queued_failure:${input.runId}:${input.expectedRevision}:${input.failure.code}`;
    const operationPayload = canonicalJson(input.failure as never);
    const replay = this.replayOperation(operationKey, operationPayload);
    if (replay) return clone(replay as RunRecord);
    const run = this.requireRun(input.runId);
    this.assertRevision(run, input.expectedRevision);
    this.assertState(run, ["queued"]);
    run.state = "failed";
    run.failure = clone(input.failure);
    run.revision += 1;
    run.updatedAt = createTimestamp();
    this.appendTransition(run, "queued", "failed", undefined, undefined, undefined, input.failure);
    const result = clone(run);
    this.writeOperationReceipt(operationKey, operationPayload, result);
    return result;
  }

  commitInputRequired(lease: OwnerLease, input: {
    runId: RunId;
    execution: ExecutionToken;
    expectedRevision: number;
    requestId?: InputRequestId;
    prompt: AssistantMessage;
    checkpoint: ExecutionCheckpoint;
  }): InputRequiredCommit {
    this.assertOwner(lease);
    const requestId = input.requestId ?? (createId("input") as InputRequestId);
    const operationKey = `input_required:${requestId}`;
    const operationPayload = canonicalJson([input.runId, input.expectedRevision, input.prompt.id, input.checkpoint] as never);
    const replay = this.replayOperation(operationKey, operationPayload);
    if (replay) return clone(replay as InputRequiredCommit);
    const run = this.requireRun(input.runId);
    this.assertExecution(run, input.execution, input.expectedRevision);
    this.assertState(run, ["running"]);
    this.assertNoOpenTools(run);
    const prompt: AssistantMessage = {
      ...clone(input.prompt),
      sequenceWithinRun: this.nextMessageSequence(run.id),
    };
    const request: { id: InputRequestId; messageId: MessageId; createdAt: string } = {
      id: requestId,
      messageId: prompt.id,
      createdAt: createTimestamp(),
    };
    this.messages.set(prompt.id, prompt);
    run.state = "input_required";
    run.checkpoint = clone(input.checkpoint);
    run.openInputRequest = request;
    delete run.execution;
    run.revision += 1;
    run.updatedAt = createTimestamp();
    this.appendMessage(run, prompt);
    this.appendTransition(run, "running", "input_required", request, prompt);
    const result = { run: clone(run), prompt: clone(prompt), request: clone(request) };
    this.writeOperationReceipt(operationKey, operationPayload, result);
    return result;
  }

  answerInput(lease: OwnerLease, input: { runId: RunId; requestId: InputRequestId; expectedRevision: number; input: UserInput; messageId?: MessageId }): RunRecord {
    this.assertOwner(lease);
    const normalizedInput = normalizeUserInput(input.input);
    const operationKey = `answer:${input.runId}:${input.requestId}`;
    const operationPayload = canonicalStartRunRequest(normalizedInput);
    const replay = this.replayOperation(operationKey, operationPayload);
    if (replay) return clone(replay as RunRecord);
    const run = this.requireRun(input.runId);
    this.assertRevision(run, input.expectedRevision);
    this.assertState(run, ["input_required"]);
    if (!run.openInputRequest || run.openInputRequest.id !== input.requestId) {
      throw new RuntimeError("input_request_conflict", { runId: run.id, requestId: input.requestId, reason: "not_found" });
    }
    const message: Message = {
      id: input.messageId ?? (createId("msg") as MessageId),
      agentId: run.agentId,
      runId: run.id,
      role: "user",
      content: userInputContent(normalizedInput),
      ...(userInputMetadata(normalizedInput) ? { metadata: clone(userInputMetadata(normalizedInput)!) } : {}),
      sequenceWithinRun: this.nextMessageSequence(run.id),
      createdAt: createTimestamp(),
    };
    this.messages.set(message.id, message);
    delete run.openInputRequest;
    run.readySequence = this.nextReady(run.agentId);
    run.state = "queued";
    run.revision += 1;
    run.updatedAt = createTimestamp();
    this.appendMessage(run, message);
    this.appendTransition(run, "input_required", "queued");
    const result = clone(run);
    this.writeOperationReceipt(operationKey, operationPayload, result);
    return result;
  }

  reserveToolCall(lease: OwnerLease, input: {
    runId: RunId;
    execution: ExecutionToken;
    expectedRevision: number;
    requestMessageId: MessageId;
    name: string;
    args: import("../runtime-events").JsonValue;
    toolCallId?: ToolCallId;
  }): ToolCommit {
    this.assertOwner(lease);
    assertToolValue(input.args, "tool.args");
    const toolCallId = input.toolCallId ?? (createId("tool") as ToolCallId);
    const operationKey = `tool_reserve:${toolCallId}`;
    const operationPayload = canonicalJson([
      input.runId,
      input.expectedRevision,
      input.execution.executionId,
      input.requestMessageId,
      input.name,
      input.args,
    ] as never);
    const replay = this.replayOperation(operationKey, operationPayload);
    if (replay) return clone(replay as ToolCommit);
    const run = this.requireRun(input.runId);
    this.assertExecution(run, input.execution, input.expectedRevision);
    const existing = this.toolCalls.get(toolCallId);
    if (existing) throw new RuntimeError("run_state_conflict", { runId: run.id, expected: ["running"], actual: run.state });
    const timestamp = createTimestamp();
    const toolCall: StoredToolCall = {
      id: toolCallId,
      agentId: run.agentId,
      runId: run.id,
      executionId: input.execution.executionId,
      requestMessageId: input.requestMessageId,
      name: input.name,
      args: clone(input.args),
      state: "pending",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const requestMessage: AssistantMessage = {
      id: input.requestMessageId,
      agentId: run.agentId,
      runId: run.id,
      role: "assistant",
      content: [{ type: "tool_use", toolCallId, name: input.name, input: clone(input.args) }],
      sequenceWithinRun: this.nextMessageSequence(run.id),
      createdAt: timestamp,
    };
    if (this.messages.has(requestMessage.id)) throw new RuntimeError("run_state_conflict", { runId: run.id, expected: ["running"], actual: run.state });
    this.toolCalls.set(toolCall.id, toolCall);
    this.messages.set(requestMessage.id, requestMessage);
    run.revision += 1;
    run.updatedAt = timestamp;
    this.appendMessage(run, requestMessage);
    this.appendToolTransition(run, { from: null, to: "pending" }, toolCall);
    const result: ToolCommit = { run: clone(run), toolCall: clone(toolCall) as unknown as ToolCallSnapshot };
    this.writeOperationReceipt(operationKey, operationPayload, result);
    return result;
  }

  startToolCall(lease: OwnerLease, input: {
    runId: RunId;
    execution: ExecutionToken;
    expectedRevision: number;
    toolCallId: ToolCallId;
  }): ToolCommit {
    this.assertOwner(lease);
    const operationKey = `tool_start:${input.toolCallId}`;
    const operationPayload = canonicalJson([input.runId, input.expectedRevision, input.execution.executionId] as never);
    const replay = this.replayOperation(operationKey, operationPayload);
    if (replay) return clone(replay as ToolCommit);
    const run = this.requireRun(input.runId);
    this.assertExecution(run, input.execution, input.expectedRevision);
    const toolCall = this.requireToolCall(input.toolCallId, run);
    if (toolCall.state !== "pending") throw new RuntimeError("run_state_conflict", { runId: run.id, expected: ["running"], actual: run.state });
    if (toolCall.executionId !== input.execution.executionId) throw new RuntimeError("runtime_ownership_lost", { reason: "epoch_advanced", expectedEpoch: input.execution.ownerEpoch, actualEpoch: this.ownerEpoch });
    toolCall.state = "running";
    toolCall.updatedAt = createTimestamp();
    run.revision += 1;
    run.updatedAt = toolCall.updatedAt;
    this.appendToolTransition(run, { from: "pending", to: "running" }, toolCall);
    const result: ToolCommit = { run: clone(run), toolCall: clone(toolCall) as unknown as ToolCallSnapshot };
    this.writeOperationReceipt(operationKey, operationPayload, result);
    return result;
  }

  commitToolResult(lease: OwnerLease, input: {
    runId: RunId;
    execution: ExecutionToken;
    expectedRevision: number;
    toolCallId: ToolCallId;
    result: import("../runtime-events").ToolExecutionResult;
    state: "completed" | "failed" | "indeterminate";
    reason?: string;
  }): ToolCommit {
    this.assertOwner(lease);
    assertToolExecutionResult(input.result);
    assertToolValue(input.result, "tool.result");
    if (input.state === "completed" && !input.result.ok) throw new TypeError("completed ToolCall requires a successful result");
    if (input.state !== "completed" && input.result.ok) throw new TypeError(`${input.state} ToolCall requires a failed result`);
    if (input.state === "indeterminate" && (!input.reason || input.reason.trim().length === 0)) throw new TypeError("indeterminate ToolCall requires a reason");
    const operationKey = `tool_commit:${input.toolCallId}`;
    const operationPayload = canonicalJson([input.runId, input.expectedRevision, input.execution.executionId, input.state, input.result, input.reason ?? null] as never);
    const replay = this.replayOperation(operationKey, operationPayload);
    if (replay) return clone(replay as ToolCommit);
    const run = this.requireRun(input.runId);
    this.assertExecution(run, input.execution, input.expectedRevision);
    const toolCall = this.requireToolCall(input.toolCallId, run);
    if (toolCall.executionId !== input.execution.executionId) throw new RuntimeError("runtime_ownership_lost", { reason: "epoch_advanced", expectedEpoch: input.execution.ownerEpoch, actualEpoch: this.ownerEpoch });
    const from = toolCall.state;
    if (from === "pending" && input.state !== "failed") throw new RuntimeError("run_state_conflict", { runId: run.id, expected: ["running"], actual: run.state });
    if (from !== "pending" && from !== "running") throw new RuntimeError("run_state_conflict", { runId: run.id, expected: ["running"], actual: run.state });
    const durableResult: DurableToolResult = { toolCallId: toolCall.id, toolName: toolCall.name, ...clone(input.result) };
    const resultMessageId = createId("msg") as MessageId;
    const message: Message = {
      id: resultMessageId,
      agentId: run.agentId,
      runId: run.id,
      role: "tool",
      content: [{ type: "tool_result", toolCallId: toolCall.id, result: clone(input.result) }],
      sequenceWithinRun: this.nextMessageSequence(run.id),
      createdAt: createTimestamp(),
    };
    this.messages.set(message.id, message);
    toolCall.state = input.state;
    toolCall.result = durableResult;
    toolCall.resultMessageId = resultMessageId;
    if (input.state === "indeterminate") toolCall.reason = input.reason!;
    else delete toolCall.reason;
    toolCall.updatedAt = message.createdAt;
    run.revision += 1;
    run.updatedAt = message.createdAt;
    this.appendToolTransition(run, { from: from as "pending" | "running", to: input.state }, toolCall);
    this.appendMessage(run, message);
    if (input.state === "indeterminate") {
      const openToolCalls = [...this.toolCalls.values()]
        .filter((candidate) => candidate.runId === run.id && candidate.executionId === input.execution.executionId && candidate.id !== toolCall.id && (candidate.state === "pending" || candidate.state === "running"));
      const indeterminateToolCallIds: ToolCallId[] = [toolCall.id];
      for (const candidate of openToolCalls) {
        if (candidate.state === "running") indeterminateToolCallIds.push(candidate.id);
        this.interruptToolCall(run, candidate, input.reason!);
      }
      const failure: RunFailure = {
        code: "tool_indeterminate",
        message: input.reason!,
        toolCallIds: indeterminateToolCallIds as [ToolCallId, ...ToolCallId[]],
      };
      run.state = "failed";
      run.failure = failure;
      delete run.execution;
      run.revision += 1;
      run.updatedAt = createTimestamp();
      this.appendTransition(run, "running", "failed", undefined, undefined, undefined, failure);
    }
    const result: ToolCommit = { run: clone(run), toolCall: clone(toolCall) as unknown as ToolCallSnapshot };
    this.writeOperationReceipt(operationKey, operationPayload, result);
    return result;
  }

  commitOutcome(lease: OwnerLease, input: {
    runId: RunId;
    execution: ExecutionToken;
    expectedRevision: number;
    outcome?: Outcome;
    failure?: RunFailure;
    output?: AssistantMessage;
  }): RunRecord {
    this.assertOwner(lease);
    const operationKey = `outcome:${input.runId}:${input.execution.executionId}`;
    const operationPayload = canonicalJson([input.expectedRevision, input.outcome ?? null, input.failure ?? null, input.output ?? null] as never);
    const replay = this.replayOperation(operationKey, operationPayload);
    if (replay) return clone(replay as RunRecord);
    const run = this.requireRun(input.runId);
    this.assertExecution(run, input.execution, input.expectedRevision);
    this.assertState(run, ["running"]);
    this.assertNoOpenTools(run);
    const nextState: Extract<RunState, "completed" | "failed"> = input.failure ? "failed" : "completed";
    if (nextState === "completed" && !input.outcome) throw new TypeError("completed Run requires an outcome");
    if (nextState === "failed" && !input.failure) throw new TypeError("failed Run requires a failure");
    const output = input.output
      ? { ...clone(input.output), sequenceWithinRun: this.nextMessageSequence(run.id) }
      : undefined;
    if (output) {
      this.messages.set(output.id, output);
      this.appendMessage(run, output);
    }
    run.state = nextState;
    if (input.outcome) run.outcome = clone(input.outcome);
    if (input.failure) run.failure = clone(input.failure);
    delete run.execution;
    run.revision += 1;
    run.updatedAt = createTimestamp();
    this.appendTransition(run, "running", nextState, undefined, output, input.outcome, input.failure);
    const result = clone(run);
    this.writeOperationReceipt(operationKey, operationPayload, result);
    return result;
  }

  cancelRun(lease: OwnerLease, input: { runId: RunId; expectedRevision?: number; reason?: string }): RunRecord {
    this.assertOwner(lease);
    const operationKey = `cancel:${input.runId}:${input.expectedRevision ?? "current"}`;
    const operationPayload = canonicalJson(input.reason ?? null as never);
    const replay = this.replayOperation(operationKey, operationPayload);
    if (replay) return clone(replay as RunRecord);
    const run = this.requireRun(input.runId);
    if (input.expectedRevision !== undefined) this.assertRevision(run, input.expectedRevision);
    if (["completed", "failed", "cancelled"].includes(run.state)) {
      const result = clone(run);
      if (input.expectedRevision !== undefined) this.writeOperationReceipt(operationKey, operationPayload, result);
      return result;
    }
    const from = run.state;
    const activeToolCalls = run.execution
      ? [...this.toolCalls.values()].filter((toolCall) => toolCall.runId === run.id && toolCall.executionId === run.execution?.executionId && (toolCall.state === "pending" || toolCall.state === "running"))
      : [];
    const indeterminateToolCallIds = activeToolCalls.filter((toolCall) => toolCall.state === "running").map((toolCall) => toolCall.id);
    for (const toolCall of activeToolCalls) this.interruptToolCall(run, toolCall, input.reason ?? "The Run was cancelled.");
    if (indeterminateToolCallIds.length > 0) {
      const failure: RunFailure = {
        code: "tool_indeterminate",
        message: input.reason ?? "The Run was cancelled while a Tool effect was in flight.",
        toolCallIds: indeterminateToolCallIds as [ToolCallId, ...ToolCallId[]],
      };
      run.state = "failed";
      run.failure = failure;
      delete run.cancellationReason;
      delete run.execution;
      delete run.openInputRequest;
      run.revision += 1;
      run.updatedAt = createTimestamp();
      this.appendTransition(run, from, "failed", undefined, undefined, undefined, failure);
      const result = clone(run);
      if (input.expectedRevision !== undefined) this.writeOperationReceipt(operationKey, operationPayload, result);
      return result;
    }
    run.state = "cancelled";
    run.cancellationReason = input.reason;
    delete run.execution;
    delete run.openInputRequest;
    run.revision += 1;
    run.updatedAt = createTimestamp();
    this.appendTransition(run, from, "cancelled", undefined, undefined, undefined, undefined, input.reason);
    const result = clone(run);
    if (input.expectedRevision !== undefined) this.writeOperationReceipt(operationKey, operationPayload, result);
    return result;
  }

  snapshotRun(lease: OwnerLease, runId: RunId): RunSnapshot {
    this.assertOwner(lease);
    const run = this.requireRun(runId);
    const base = {
      runId: run.id,
      agentId: run.agentId,
      agentSequence: run.agentSequence,
      revision: run.revision,
      input: clone(run.input),
      ...(run.metadata ? { metadata: clone(run.metadata) } : {}),
      messageCount: this.messagesForRun(run.id).length,
      toolCallCount: [...this.toolCalls.values()].filter((toolCall) => toolCall.runId === run.id).length,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      cursor: this.cursorForRun(run.id),
    };
    switch (run.state) {
      case "queued":
      case "running": return { ...base, state: run.state };
      case "input_required": {
        const request = run.openInputRequest;
        const prompt = request && this.messages.get(request.messageId);
        if (!prompt || prompt.role !== "assistant") throw new Error(`Run ${run.id} has an invalid input prompt.`);
        return { ...base, state: "input_required", request: { id: request.id, prompt: clone(prompt) } };
      }
      case "completed": {
        const output = this.messagesForRun(run.id).filter((message): message is AssistantMessage => message.role === "assistant").at(-1);
        return { ...base, state: "completed", outcome: clone(run.outcome!), ...(output ? { output: clone(output) } : {}) };
      }
      case "failed": return { ...base, state: "failed", failure: clone(run.failure!) };
      case "cancelled": return { ...base, state: "cancelled", ...(run.cancellationReason ? { reason: run.cancellationReason } : {}) };
    }
  }

  listAgents(lease: OwnerLease): readonly AgentRecord[] {
    this.assertOwner(lease);
    return clone([...this.agents.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  }

  listRuns(lease: OwnerLease, input: { agentId?: AgentId; states?: readonly RunState[] } = {}): readonly RunRecord[] {
    this.assertOwner(lease);
    return clone([...this.runs.values()]
      .filter((run) => input.agentId === undefined || run.agentId === input.agentId)
      .filter((run) => !input.states || input.states.includes(run.state))
      .sort((a, b) => a.agentSequence - b.agentSequence || a.id.localeCompare(b.id)));
  }

  listEvents(lease: OwnerLease, input: { after?: EventCursor } = {}): readonly DurableRunEvent[] {
    this.assertOwner(lease);
    const after = input.after ? this.parseCursor(input.after) : 0;
    return clone(this.events.filter((event) => this.parseCursor(event.cursor) > after));
  }

  openConsumer(lease: OwnerLease, consumerId: string): ConsumerRegistration {
    this.assertOwner(lease);
    if (consumerId.trim().length === 0) throw new TypeError("consumerId must be non-empty");
    return {
      ...(this.consumerCheckpoints.has(consumerId) ? { cursor: this.consumerCheckpoints.get(consumerId)! } : {}),
      waterline: `${this.incarnation}:${this.eventSequence}` as EventCursor,
    };
  }

  advanceConsumerCheckpoint(lease: OwnerLease, input: { consumerId: string; cursor: EventCursor }): void {
    this.assertOwner(lease);
    const next = this.parseCursor(input.cursor);
    if (next > this.eventSequence) throw new RuntimeError("invalid_cursor", { cursorType: "event", reason: "beyond_waterline" });
    const previous = this.consumerCheckpoints.get(input.consumerId);
    if (previous !== undefined && next <= this.parseCursor(previous)) return;
    this.consumerCheckpoints.set(input.consumerId, input.cursor);
  }

  private replay(scope: readonly string[], payload: string): unknown | undefined {
    const key = encodeIdempotencyScope(this.incarnation, scope as never);
    const receipt = this.idempotency.get(key);
    if (!receipt) return undefined;
    if (receipt.payload !== payload) {
      throw new RuntimeError("idempotency_conflict", {
        scope: scope[0] as "create_agent" | "update_agent_config" | "start_run",
        idempotencyKey: scope.at(-1)!,
      });
    }
    return receipt.result;
  }

  private writeReceipt(scope: readonly string[], payload: string, result: unknown): void {
    this.idempotency.set(encodeIdempotencyScope(this.incarnation, scope as never), { payload, result: clone(result) });
  }

  private replayOperation(key: string, payload: string): unknown | undefined {
    const receipt = this.operationReceipts.get(key);
    if (!receipt) return undefined;
    if (receipt.payload !== payload) throw new Error(`Idempotency payload conflict for ${key}.`);
    return receipt.result;
  }

  private writeOperationReceipt(key: string, payload: string, result: unknown): void {
    this.operationReceipts.set(key, { payload, result: clone(result) });
  }

  private requireAgent(agentId: AgentId): StoredAgent {
    const agent = this.agents.get(agentId);
    if (!agent) throw new RuntimeError("agent_not_found", { agentId });
    return agent;
  }

  private requireRun(runId: RunId): StoredRun {
    const run = this.runs.get(runId);
    if (!run) throw new RuntimeError("run_not_found", { runId });
    return run;
  }

  private requireToolCall(toolCallId: ToolCallId, run: StoredRun): StoredToolCall {
    const toolCall = this.toolCalls.get(toolCallId);
    if (!toolCall || toolCall.runId !== run.id) throw new RuntimeError("run_state_conflict", { runId: run.id, expected: ["running"], actual: run.state });
    return toolCall;
  }

  private assertNoOpenTools(run: StoredRun): void {
    if ([...this.toolCalls.values()].some((toolCall) => toolCall.runId === run.id && (toolCall.state === "pending" || toolCall.state === "running"))) {
      throw new RuntimeError("run_state_conflict", { runId: run.id, expected: ["running"], actual: run.state });
    }
  }

  private interruptToolCall(run: StoredRun, toolCall: StoredToolCall, reason: string): void {
    const result: ToolExecutionResult = { ok: false, content: null, error: reason };
    const durableResult: DurableToolResult = { toolCallId: toolCall.id, toolName: toolCall.name, ...result };
    const message: Message = {
      id: createId("msg") as MessageId,
      agentId: run.agentId,
      runId: run.id,
      role: "tool",
      content: [{ type: "tool_result", toolCallId: toolCall.id, result }],
      sequenceWithinRun: this.nextMessageSequence(run.id),
      createdAt: createTimestamp(),
    };
    const from = toolCall.state as "pending" | "running";
    const to = from === "running" ? "indeterminate" : "failed";
    this.messages.set(message.id, message);
    toolCall.state = to;
    toolCall.result = durableResult;
    toolCall.resultMessageId = message.id;
    if (to === "indeterminate") toolCall.reason = reason;
    toolCall.updatedAt = message.createdAt;
    run.revision += 1;
    run.updatedAt = message.createdAt;
    this.appendToolTransition(run, { from, to }, toolCall);
    this.appendMessage(run, message);
  }

  private assertState(run: StoredRun, expected: readonly RunState[]): void {
    if (!expected.includes(run.state)) throw new RuntimeError("run_state_conflict", { runId: run.id, expected, actual: run.state });
  }

  private assertRevision(run: StoredRun, expected: number): void {
    if (run.revision !== expected) throw new RuntimeError("run_state_conflict", { runId: run.id, expected: [run.state], actual: run.state });
  }

  private assertExecution(run: StoredRun, execution: ExecutionToken, expectedRevision: number): void {
    this.assertRevision(run, expectedRevision);
    if (run.state !== "running" || !run.execution || run.execution.executionId !== execution.executionId || run.execution.ownerEpoch !== execution.ownerEpoch) {
      throw new RuntimeError("runtime_ownership_lost", { reason: "epoch_advanced", expectedEpoch: execution.ownerEpoch, actualEpoch: this.ownerEpoch });
    }
  }

  private nextSequence(agentId: AgentId): number {
    const next = this.nextAgentSequence.get(agentId) ?? 0;
    this.nextAgentSequence.set(agentId, next + 1);
    return next;
  }

  private nextReady(agentId: AgentId): number {
    const next = this.nextReadySequence.get(agentId) ?? 0;
    this.nextReadySequence.set(agentId, next + 1);
    return next;
  }

  private nextMessageSequence(runId: RunId): number {
    return this.messagesForRun(runId).length;
  }

  private messagesForRun(runId: RunId): Message[] {
    return [...this.messages.values()].filter((message) => message.runId === runId).sort((a, b) => a.sequenceWithinRun - b.sequenceWithinRun);
  }

  private history(agentId: AgentId, beforeSequence: number): readonly Message[] {
    return clone([...this.runs.values()]
      .filter((run) => run.agentId === agentId && run.agentSequence <= beforeSequence)
      .sort((a, b) => a.agentSequence - b.agentSequence)
      .flatMap((run) => this.messagesForRun(run.id)));
  }

  private appendMessage(run: StoredRun, message: Message): void {
    this.events.push(this.baseEvent(run, {
      kind: "message_committed",
      message,
    } as MessageCommitted) as MessageCommitted);
  }

  private appendTransition(
    run: StoredRun,
    from: RunState | null,
    to: RunState,
    request?: { id: InputRequestId; messageId: MessageId; createdAt: string },
    prompt?: AssistantMessage,
    outcome?: Outcome,
    failure?: RunFailure,
    reason?: string,
  ): void {
    const transition: RunTransitioned = {
      ...this.baseEvent(run),
      kind: "run_transitioned",
      from,
      to,
      ...(to === "input_required" && request && prompt ? { request: { id: request.id, prompt } } : {}),
      ...(to === "completed" && outcome ? { outcome } : {}),
      ...(to === "failed" && failure ? { failure: failure as never } : {}),
      ...(to === "cancelled" && reason ? { reason } : {}),
    } as RunTransitioned;
    this.events.push(transition);
  }

  private appendToolTransition(run: StoredRun, transition: { from: null | "pending" | "running"; to: "pending" | "running" | "completed" | "failed" | "indeterminate" }, toolCall: StoredToolCall): void {
    this.events.push(this.baseEvent(run, {
      kind: "tool_state_changed",
      transition,
      toolCall: toolCall as unknown as ToolCallSnapshot,
    } as ToolStateChanged) as ToolStateChanged);
  }

  private baseEvent(run: StoredRun, extra?: Partial<DurableEventBase>): DurableEventBase & Partial<DurableRunEvent> {
    this.eventSequence += 1;
    return {
      id: createId("evt") as EventId,
      schemaVersion: 1,
      cursor: `${this.incarnation}:${this.eventSequence}` as EventCursor,
      durability: "durable",
      agentId: run.agentId,
      runId: run.id,
      runRevision: run.revision,
      createdAt: createTimestamp(),
      ...extra,
    };
  }

  private cursorForRun(runId: RunId): EventCursor {
    return ([...this.events].reverse().find((event) => event.runId === runId)?.cursor ?? `${this.incarnation}:0`) as EventCursor;
  }

  private parseCursor(cursor: EventCursor): number {
    const [incarnation, sequence] = String(cursor).split(":");
    if (incarnation !== this.incarnation || !sequence || !/^\d+$/.test(sequence)) throw new RuntimeError("invalid_cursor", { cursorType: "event", reason: "wrong_store" });
    return Number(sequence);
  }
}

class MemoryOwnedStore implements OwnedStore {
  constructor(private readonly store: InMemoryStore, public lease: OwnerLease) {}

  async reserveAgent(input: { idempotencyKey: string; metadata?: Metadata; configIdentity?: string }): Promise<AgentRecord> { return this.store.reserveAgent(this.lease, input); }
  async activateAgent(agentId: AgentId, configToken?: ConfigToken, configIdentity?: string): Promise<AgentRecord> { return this.store.activateAgent(this.lease, agentId, configToken, configIdentity); }
  async updateAgentConfigToken(input: { agentId: AgentId; token: ConfigToken; configIdentity?: string; idempotencyKey: string }): Promise<AgentRecord> { return this.store.updateAgentConfigToken(this.lease, input); }
  async createRun(input: { agentId: AgentId; input: UserInput; metadata?: Metadata; idempotencyKey: string }): Promise<RunRecord> { return this.store.createRun(this.lease, input); }
  async claimRun(input: { runId: RunId; expectedRevision: number; executionId?: ExecutionId; messageId?: MessageId; configToken?: ConfigToken }): Promise<RunClaim> { return this.store.claimRun(this.lease, input); }
  async failQueuedRun(input: { runId: RunId; expectedRevision: number; failure: Extract<RunFailure, { code: "configuration_unavailable" | "checkpoint_incompatible" }> }): Promise<RunRecord> { return this.store.failQueuedRun(this.lease, input); }
  async commitInputRequired(input: { runId: RunId; execution: ExecutionToken; expectedRevision: number; requestId?: InputRequestId; prompt: AssistantMessage; checkpoint: ExecutionCheckpoint }): Promise<InputRequiredCommit> { return this.store.commitInputRequired(this.lease, input); }
  async answerInput(input: { runId: RunId; requestId: InputRequestId; expectedRevision: number; input: UserInput; messageId?: MessageId }): Promise<RunRecord> { return this.store.answerInput(this.lease, input); }
  async commitOutcome(input: { runId: RunId; execution: ExecutionToken; expectedRevision: number; outcome?: Outcome; failure?: RunFailure; output?: AssistantMessage }): Promise<RunRecord> { return this.store.commitOutcome(this.lease, input); }
  async reserveToolCall(input: { runId: RunId; execution: ExecutionToken; expectedRevision: number; requestMessageId: MessageId; name: string; args: import("../runtime-events").JsonValue; toolCallId?: ToolCallId }): Promise<ToolCommit> { return this.store.reserveToolCall(this.lease, input); }
  async startToolCall(input: { runId: RunId; execution: ExecutionToken; expectedRevision: number; toolCallId: ToolCallId }): Promise<ToolCommit> { return this.store.startToolCall(this.lease, input); }
  async commitToolResult(input: { runId: RunId; execution: ExecutionToken; expectedRevision: number; toolCallId: ToolCallId; result: ToolExecutionResult; state: "completed" | "failed" | "indeterminate"; reason?: string }): Promise<ToolCommit> { return this.store.commitToolResult(this.lease, input); }
  async cancelRun(input: { runId: RunId; expectedRevision?: number; reason?: string }): Promise<RunRecord> { return this.store.cancelRun(this.lease, input); }
  async snapshotRun(runId: RunId): Promise<RunSnapshot> { return this.store.snapshotRun(this.lease, runId); }
  async listAgents(): Promise<readonly AgentRecord[]> { return this.store.listAgents(this.lease); }
  async listRuns(input?: { agentId?: AgentId; states?: readonly RunState[] }): Promise<readonly RunRecord[]> { return this.store.listRuns(this.lease, input); }
  async listEvents(input?: { after?: EventCursor }): Promise<readonly DurableRunEvent[]> { return this.store.listEvents(this.lease, input); }
  async renewOwner(leaseMs: number): Promise<OwnerLease> { this.lease = this.store.renewOwner(this.lease, leaseMs); return clone(this.lease); }
  async openConsumer(consumerId: string): Promise<ConsumerRegistration> { return this.store.openConsumer(this.lease, consumerId); }
  async advanceConsumerCheckpoint(input: { consumerId: string; cursor: EventCursor }): Promise<void> { this.store.advanceConsumerCheckpoint(this.lease, input); }
  async sealAndReleaseOwner(): Promise<void> {
    this.store.interruptOwner(this.lease.epoch, "The Runtime owner was sealed.");
    this.store.releaseOwner(this.lease);
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function expiry(leaseMs: number): string {
  return new Date(Date.now() + leaseMs).toISOString();
}

function assertLeaseDuration(leaseMs: number): void {
  if (!Number.isFinite(leaseMs) || leaseMs <= 0) throw new TypeError("leaseMs must be a positive finite number");
}

function ownershipLost(expected: OwnerLease, actual: OwnerLease | undefined, reason: "expired" | "released" | "epoch_advanced"): RuntimeError<"runtime_ownership_lost"> {
  return new RuntimeError("runtime_ownership_lost", {
    reason: actual ? reason : "released",
    expectedEpoch: expected.epoch,
    actualEpoch: actual?.epoch ?? expected.epoch,
    ...(actual ? { expiresAt: actual.expiresAt } : {}),
  });
}

function userInputContent(input: UserInput): UserContent {
  return typeof input === "string" ? input : input.content;
}

function userInputMetadata(input: UserInput): Metadata | undefined {
  return typeof input === "string" ? undefined : input.metadata;
}

function assertToolValue(value: import("../runtime-events").JsonValue, argument: string): void {
  assertUtf8ByteLimit(canonicalJson(value), TOOL_VALUE_JSON_BYTES, argument);
}
