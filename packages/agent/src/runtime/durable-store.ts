import { createHash } from "node:crypto";
import type { ContentBlock } from "@rowan-agent/models";
import { createId, createTimestamp } from "../utils";
import type {
  AgentId,
  AgentRecord,
  AgentDeletionRequest,
  AssistantMessage,
  ConsumerRegistration,
  ContextCompactionRecord,
  ContextStatus,
  ConfigToken,
  DurableEventBase,
  DurableRunEvent,
  EntryPhaseSpec,
  ExecutionCheckpoint,
  ExecutionId,
  ExecutionToken,
  EventCursor,
  Message,
  MessageRevisionResult,
  RetentionResult,
  MessageRevised,
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
  RunStateChanged,
  ToolBatchCommit,
  ToolCallReservation,
  UserInput,
} from "./contracts";
import type { DurableStore, OwnedStore } from "./contracts";
import type { JsonValue } from "../runtime-events";
import {
  assertEntryPhases,
  assertToolExecutionResult,
  isAssistantMessage,
} from "./contracts";
import { RuntimeError } from "./errors";
import { createIdempotencyScope, encodeIdempotencyScope, canonicalStartRunRequest } from "./idempotency";
import { TOOL_VALUE_JSON_BYTES } from "./idempotency";
import { assertJsonValue, assertUtf8ByteLimit, canonicalJson } from "./json";
import { normalizeUserInput } from "./contracts";
import type {
  AssistantContent,
  DurableToolResult,
  EventId,
  InteractionRecord,
  ToolCallId,
  ToolCallSnapshot,
  ToolExecutionResult,
  ToolStateChanged,
  UserContent,
  UserMessage,
} from "../runtime-events";
import type { HistorySeed } from "./contracts";
import type { RunInteraction } from "../harness/phases/interactions";

export type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };
export type StoredAgent = Mutable<AgentRecord>;
export type StoredRun = Mutable<RunRecord>;
export type StoredOwner = Mutable<OwnerLease>;
export type StoredToolCall = {
  id: ToolCallId;
  providerToolCallId: string;
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

export type IdempotencyReceipt = {
  payload: string;
  result: unknown;
};

export type StoreMutationRecorder = {
  onAgentUpsert(agent: StoredAgent): void;
  onAgentDelete(agentId: AgentId): void;
  onRunUpsert(run: StoredRun): void;
  onRunDelete(runId: RunId): void;
  onMessageInsert(message: Message): void;
  onMessageDelete(messageId: MessageId): void;
  onToolCallUpsert(toolCall: StoredToolCall): void;
  onToolCallDelete(toolCallId: ToolCallId): void;
  onEventAppend(event: DurableRunEvent): void;
  onEventsTruncate(deletedEventIds: string[]): void;
  onIdempotencyUpsert(scope: string, receipt: IdempotencyReceipt): void;
  onIdempotencyDelete(scope: string): void;
  onOperationReceiptUpsert(key: string, receipt: IdempotencyReceipt): void;
  onOperationReceiptDelete(key: string): void;
  onConsumerCheckpointUpsert(consumerId: string, cursor: EventCursor): void;
  onConsumerCheckpointDelete(consumerId: string): void;
  onContextCompactionUpsert(agentId: AgentId, record: ContextCompactionRecord): void;
  onRetentionFloorChange(floor: number): void;
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
  historySeeds?: readonly (readonly [AgentId, readonly Message[]])[];
  consumerCheckpoints?: readonly (readonly [string, EventCursor])[];
  retentionFloor?: number;
  nextAgentSequence: readonly (readonly [AgentId, number])[];
  nextReadySequence: readonly (readonly [AgentId, number])[];
  eventSequence: number;
  contextCompactions?: readonly (readonly [AgentId, ContextCompactionRecord])[];
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
  private readonly historySeeds = new Map<AgentId, readonly Message[]>();
  private readonly consumerCheckpoints = new Map<string, EventCursor>();
  private readonly nextAgentSequence = new Map<AgentId, number>();
  private readonly nextReadySequence = new Map<AgentId, number>();
  private owner?: StoredOwner;
  private ownerEpoch = 0;
  private eventSequence = 0;
  private retentionFloor = 1;
  private readonly contextCompactions = new Map<AgentId, ContextCompactionRecord>();
  private recorder?: StoreMutationRecorder;
  private readonly runReceiptKeys = new Map<RunId, Set<string>>();

  constructor(options: { incarnation?: string } = {}) {
    this.incarnation = options.incarnation ?? createId("store");
  }

  setChangeRecorder(recorder?: StoreMutationRecorder): void {
    this.recorder = recorder;
  }

  private touchAgent(agent: StoredAgent): void {
    this.recorder?.onAgentUpsert(agent);
  }

  private touchRun(run: StoredRun): void {
    this.recorder?.onRunUpsert(run);
  }

  private storeMessage(message: Message): void {
    this.messages.set(message.id, message);
    this.recorder?.onMessageInsert(message);
  }

  private storeToolCall(toolCall: StoredToolCall): void {
    this.toolCalls.set(toolCall.id, toolCall);
    this.recorder?.onToolCallUpsert(toolCall);
  }

  private appendEvent(event: DurableRunEvent): void {
    this.events.push(event);
    this.recorder?.onEventAppend(event);
  }

  inferRunIdForReceipt(key: string, payload: string): RunId | undefined {
    const parts = key.split(":");
    const prefix = parts[0];
    if (["queued_failure", "phase_entered", "input_required", "interaction_answer", "outcome", "cancel"].includes(prefix!) && parts[1]) {
      return parts[1] as RunId;
    }
    const match = payload.match(/^\[\s*"([^"]+)"/);
    if (match && match[1]) {
      const candidate = match[1] as RunId;
      if (this.runs.has(candidate) || candidate.startsWith("run_") || candidate.startsWith("run-")) {
        return candidate;
      }
    }
    return undefined;
  }

  dropRunOperationReceipts(runId: RunId): void {
    const keys = this.runReceiptKeys.get(runId);
    if (keys && keys.size > 0) {
      for (const key of keys) {
        this.operationReceipts.delete(key);
        this.recorder?.onOperationReceiptDelete(key);
      }
      this.runReceiptKeys.delete(runId);
    }
    for (const [key] of this.operationReceipts.entries()) {
      if (key.includes(`:${runId}:`) || key.endsWith(`:${runId}`) || key.startsWith(`phase_output:${runId}`) || key.startsWith(`tool_reserve_batch:${runId}`)) {
        this.operationReceipts.delete(key);
        this.recorder?.onOperationReceiptDelete(key);
      }
    }
  }

  compactTerminalReceipts(): number {
    let count = 0;
    for (const [key, receipt] of [...this.operationReceipts.entries()]) {
      const runId = this.inferRunIdForReceipt(key, receipt.payload);
      if (runId) {
        const run = this.runs.get(runId);
        if (!run || ["completed", "failed", "cancelled"].includes(run.state)) {
          this.operationReceipts.delete(key);
          const keys = this.runReceiptKeys.get(runId);
          if (keys) {
            keys.delete(key);
            if (keys.size === 0) this.runReceiptKeys.delete(runId);
          }
          this.recorder?.onOperationReceiptDelete(key);
          count += 1;
        }
      }
    }
    return count;
  }

  static fromState(state: InMemoryStoreState): InMemoryStore {
    const store = new InMemoryStore({ incarnation: state.incarnation });
    for (const agent of state.agents) store.agents.set(agent.id, clone(agent));
    for (const run of state.runs) {
      const clonedRun = clone(run) as any;
      if (clonedRun.openInputRequest) {
        delete clonedRun.openInputRequest;
        delete clonedRun.checkpoint;
        delete clonedRun.execution;
        delete clonedRun.openInteractions;
        delete clonedRun.interactionAnswers;
        clonedRun.state = "cancelled";
        clonedRun.cancellationReason = "Input Request retired in v0.13";
        clonedRun.revision += 1;
        clonedRun.updatedAt = createTimestamp();
        store.runs.set(clonedRun.id, clonedRun);
        store.appendTransition(clonedRun, "input_required", "cancelled", { reason: clonedRun.cancellationReason });
        store.dropRunOperationReceipts(clonedRun.id);
      } else {
        store.runs.set(clonedRun.id, clonedRun);
      }
    }
    for (const message of state.messages) store.messages.set(message.id, clone(message));
    for (const toolCall of state.toolCalls ?? []) store.toolCalls.set(toolCall.id, clone(toolCall));
    store.events.push(...clone(state.events));
    for (const [key, receipt] of state.idempotency) store.idempotency.set(key, clone(receipt));
    for (const [key, receipt] of state.operationReceipts) {
      store.operationReceipts.set(key, clone(receipt));
      const runId = store.inferRunIdForReceipt(key, receipt.payload);
      if (runId) {
        let keys = store.runReceiptKeys.get(runId);
        if (!keys) {
          keys = new Set();
          store.runReceiptKeys.set(runId, keys);
        }
        keys.add(key);
      }
    }
    for (const [agentId, messages] of state.historySeeds ?? []) store.historySeeds.set(agentId, clone(messages));
    for (const [consumerId, cursor] of state.consumerCheckpoints ?? []) store.consumerCheckpoints.set(consumerId, cursor);
    for (const [agentId, sequence] of state.nextAgentSequence) store.nextAgentSequence.set(agentId, sequence);
    for (const [agentId, sequence] of state.nextReadySequence) store.nextReadySequence.set(agentId, sequence);
    store.eventSequence = state.eventSequence;
    store.retentionFloor = Math.max(1, state.retentionFloor ?? 1);
    for (const [agentId, record] of state.contextCompactions ?? []) store.contextCompactions.set(agentId, clone(record));
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
      historySeeds: [...this.historySeeds.entries()],
      consumerCheckpoints: [...this.consumerCheckpoints.entries()],
      retentionFloor: this.retentionFloor,
      nextAgentSequence: [...this.nextAgentSequence.entries()],
      nextReadySequence: [...this.nextReadySequence.entries()],
      eventSequence: this.eventSequence,
      contextCompactions: [...this.contextCompactions.entries()],
    });
  }

  exportMetadata(): Record<string, unknown> {
    return {
      incarnation: this.incarnation,
      eventSequence: this.eventSequence,
      nextAgentSequence: [...this.nextAgentSequence.entries()],
      nextReadySequence: [...this.nextReadySequence.entries()],
      historySeeds: [...this.historySeeds.entries()],
      contextCompactions: [...this.contextCompactions.entries()],
    };
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
      this.dropClaimReceipt(run.execution);
      delete run.execution;
      run.revision += 1;
      run.updatedAt = createTimestamp();
      this.appendTransition(run, "running", "failed", { failure });
      this.dropRunOperationReceipts(run.id);
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
    this.dropSettledClaimReceipts();
    this.compactTerminalReceipts();
    this.ownerEpoch += 1;
    this.owner = {
      ownerId: input.ownerId,
      token: `${this.incarnation}:${this.ownerEpoch}:${input.ownerId}` as OwnerToken,
      epoch: this.ownerEpoch,
      expiresAt: expiry(input.leaseMs),
    };
    return new MemoryOwnedStore(this, clone(this.owner));
  }

  assertOwner(lease: OwnerLease, requireLive = true): void {
    const actual = this.owner;
    if (!actual || actual.token !== lease.token || actual.epoch !== lease.epoch || actual.ownerId !== lease.ownerId) {
      throw ownershipLost(lease, actual, "epoch_advanced");
    }
    if (requireLive && Date.parse(actual.expiresAt) <= Date.now()) {
      throw ownershipLost(lease, actual, "expired");
    }
  }

  renewOwner(lease: OwnerLease, leaseMs: number): OwnerLease {
    // Renewal and owner acquisition are serialized by the Store. A late
    // heartbeat may revive the same identity while its epoch is unchanged;
    // once another owner advances the epoch, the identity check still fences
    // this caller.
    this.assertOwner(lease, false);
    assertLeaseDuration(leaseMs);
    this.owner!.expiresAt = expiry(leaseMs);
    return clone(this.owner!);
  }

  releaseOwner(lease: OwnerLease): void {
    this.assertOwner(lease);
    this.owner = undefined;
  }

  reserveAgent(lease: OwnerLease, input: { idempotencyKey: string; metadata?: Metadata; configIdentity?: string; historySeed?: HistorySeed }): AgentRecord {
    this.assertOwner(lease);
    const scope = createIdempotencyScope("create_agent", input.idempotencyKey);
    const payload = canonicalJson({
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
      ...(input.configIdentity === undefined ? {} : { configIdentity: input.configIdentity }),
      ...(input.historySeed === undefined ? {} : { historySeed: input.historySeed }),
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
    this.touchAgent(agent);
    if (input.historySeed && input.historySeed.length > 0) this.historySeeds.set(agent.id, materializeHistorySeed(agent.id, input.historySeed));
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
    this.touchAgent(agent);
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
    this.touchAgent(agent);
    this.writeReceipt(scope, payload, agent);
    return clone(agent);
  }

  deleteAgent(lease: OwnerLease, input: AgentDeletionRequest): void {
    this.assertOwner(lease);
    if (input.confirmation !== "agent-delete-v1") {
      throw new TypeError("Agent deletion requires the agent-delete-v1 confirmation token");
    }
    const agent = this.requireAgent(input.agentId);
    const runs = [...this.runs.values()].filter((run) => run.agentId === agent.id);
    const expected = new Set(input.expectedRunIds.map(String));
    const actual = new Set(runs.map((run) => String(run.id)));
    if (expected.size !== actual.size || [...actual].some((runId) => !expected.has(runId))) {
      throw new RuntimeError("run_state_conflict", {
        runId: runs[0]?.id ?? input.expectedRunIds[0] ?? "unknown",
        expected: [],
        actual: "cancelled",
      });
    }
    const runIds = new Set(runs.map((run) => run.id));
    this.agents.delete(agent.id);
    this.recorder?.onAgentDelete(agent.id);
    this.nextAgentSequence.delete(agent.id);
    this.nextReadySequence.delete(agent.id);
    this.historySeeds.delete(agent.id);
    for (const run of runs) {
      this.runs.delete(run.id);
      this.runReceiptKeys.delete(run.id);
      this.recorder?.onRunDelete(run.id);
    }
    for (const [messageId, message] of this.messages) {
      if (runIds.has(message.runId)) {
        this.messages.delete(messageId);
        this.recorder?.onMessageDelete(messageId);
      }
    }
    for (const [toolCallId, toolCall] of this.toolCalls) {
      if (runIds.has(toolCall.runId)) {
        this.toolCalls.delete(toolCallId);
        this.recorder?.onToolCallDelete(toolCallId);
      }
    }
    const deletedEventIds: string[] = [];
    for (let index = this.events.length - 1; index >= 0; index -= 1) {
      if (this.events[index]!.agentId === agent.id) {
        deletedEventIds.push(this.events[index]!.id);
        this.events.splice(index, 1);
      }
    }
    if (deletedEventIds.length > 0) {
      this.recorder?.onEventsTruncate(deletedEventIds);
    }
    for (const [key] of this.idempotency) {
      if (key.includes(String(agent.id)) || [...runIds].some((runId) => key.includes(String(runId)))) {
        this.idempotency.delete(key);
        this.recorder?.onIdempotencyDelete(key);
      }
    }
    for (const [key] of this.operationReceipts) {
      if (key.includes(String(agent.id)) || [...runIds].some((runId) => key.includes(String(runId)))) {
        this.operationReceipts.delete(key);
        this.recorder?.onOperationReceiptDelete(key);
      }
    }
  }

  reviseMessage(lease: OwnerLease, input: {
    agentId: AgentId;
    messageId: MessageId;
    expectedMessageRevision: number;
    content: UserContent;
    operationId: string;
    effectDigestConfirmation?: string;
  }): MessageRevisionResult {
    this.assertOwner(lease);
    if (!Number.isInteger(input.expectedMessageRevision) || input.expectedMessageRevision < 0) {
      throw new TypeError("expectedMessageRevision must be a non-negative integer");
    }
    if (typeof input.operationId !== "string" || input.operationId.length === 0) throw new TypeError("operationId must be non-empty");
    const normalized = normalizeUserInput({ content: input.content });
    const operationKey = `revise_message:${input.agentId}:${input.operationId}`;
    const operationPayload = canonicalJson([
      input.messageId,
      input.expectedMessageRevision,
      normalized,
      input.effectDigestConfirmation ?? null,
    ] as never);
    const replay = this.replayOperation(operationKey, operationPayload);
    if (replay) return clone(replay as MessageRevisionResult);

    const agent = this.requireAgent(input.agentId);
    const seed = this.historySeeds.get(agent.id) ?? [];
    const original = this.messages.get(input.messageId)
      ?? seed.find(({ id }) => id === input.messageId);
    if (!original || original.agentId !== agent.id || original.role !== "user") {
      throw new RuntimeError("message_revision_conflict", {
        agentId: agent.id,
        messageId: input.messageId,
        expected: input.expectedMessageRevision,
        actual: -1,
      });
    }
    const coveredThrough = this.contextCompactions.get(agent.id)?.coveredThrough;
    if (coveredThrough) {
      const history = this.activeHistory(agent.id, Number.MAX_SAFE_INTEGER);
      const coveredIndex = history.findIndex((message) => message.id === coveredThrough.messageId);
      const originalIndex = history.findIndex((message) => message.id === original.id);
      if (coveredIndex >= 0 && originalIndex >= 0 && originalIndex <= coveredIndex) {
        throw new RuntimeError("message_history_compacted", {
          agentId: agent.id,
          messageId: original.id,
        });
      }
    }
    const actualRevision = original.messageRevision ?? 0;
    if (actualRevision !== input.expectedMessageRevision) {
      throw new RuntimeError("message_revision_conflict", {
        agentId: agent.id,
        messageId: input.messageId,
        expected: input.expectedMessageRevision,
        actual: actualRevision,
      });
    }
    // A fork's copied context is intentionally not represented by a Run. It
    // is still editable: treat its synthetic seed sequence as the prefix
    // before the first real Run, then move the revised Message into the new
    // replacement Run below.
    const targetRun = this.runs.get(original.runId);
    const isSeedMessage = !targetRun
      && seed.some(({ id }) => id === original.id);
    if (!targetRun && !isSeedMessage) {
      throw new RuntimeError("message_revision_conflict", {
        agentId: agent.id,
        messageId: input.messageId,
        expected: input.expectedMessageRevision,
        actual: actualRevision,
      });
    }
    const targetAgentSequence = targetRun?.agentSequence ?? -1;
    const affectedRuns = [...this.runs.values()]
      .filter((run) => run.agentId === agent.id && run.agentSequence >= targetAgentSequence)
      .sort((left, right) => left.agentSequence - right.agentSequence);
    const affectedRunIds = affectedRuns.map((run) => run.id);
    const affectedRunSet = new Set(affectedRunIds);
    const affectedTools = [...this.toolCalls.values()]
      .filter((toolCall) => affectedRunSet.has(toolCall.runId))
      .sort((left, right) => String(left.id).localeCompare(String(right.id)));
    const effectDigest = affectedTools.length > 0 ? digestToolEffects(affectedTools) : undefined;
    if (effectDigest && input.effectDigestConfirmation !== effectDigest) {
      throw new RuntimeError("tool_effect_confirmation_required", {
        agentId: agent.id,
        messageId: input.messageId,
        effectDigest,
        toolCallIds: affectedTools.map((toolCall) => toolCall.id),
      });
    }

    const timestamp = createTimestamp();
    const replacementRun: StoredRun = {
      id: createId("run") as RunId,
      agentId: agent.id,
      agentSequence: this.nextSequence(agent.id),
      readySequence: this.nextReady(agent.id),
      revision: 0,
      state: "queued",
      input: targetInput(normalized, original.metadata),
      initialMessageId: original.id,
      ...((targetRun?.pinnedConfigToken ?? this.agents.get(agent.id)?.currentConfigToken) === undefined
        ? {}
        : { pinnedConfigToken: targetRun?.pinnedConfigToken ?? this.agents.get(agent.id)?.currentConfigToken }),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    for (const run of affectedRuns) {
      const previousState = run.state;
      run.invalidatedBy = { messageId: original.id, messageRevision: actualRevision + 1 };
      if (run.state === "running" || run.state === "queued" || run.state === "input_required") {
        if (run.state === "running") {
          const openToolCalls = [...this.toolCalls.values()]
            .filter((toolCall) => toolCall.runId === run.id && toolCall.executionId === run.execution?.executionId && (toolCall.state === "pending" || toolCall.state === "running"));
          for (const toolCall of openToolCalls) this.interruptToolCall(run, toolCall, "Run superseded by Message revision.");
        } else {
          delete run.openInteractions;
          delete run.interactionAnswers;
          delete run.checkpoint;
        }
        this.dropClaimReceipt(run.execution);
        delete run.execution;
        run.state = "cancelled";
        run.cancellationReason = "Run superseded by Message revision.";
        run.revision += 1;
        run.updatedAt = timestamp;
        this.appendTransition(run, previousState, "cancelled", { reason: run.cancellationReason });
        this.dropRunOperationReceipts(run.id);
      } else {
        run.revision += 1;
        run.updatedAt = timestamp;
        this.touchRun(run);
      }
    }

    for (const [messageId, message] of this.messages) {
      if (!affectedRunSet.has(message.runId)) continue;
      if (message.runId !== original.runId || message.sequenceWithinRun > original.sequenceWithinRun) {
        this.messages.delete(messageId);
        this.recorder?.onMessageDelete(messageId);
      }
    }
    if (isSeedMessage) {
      const targetIndex = seed.findIndex(({ id }) => id === original.id);
      if (targetIndex >= 0) this.historySeeds.set(agent.id, seed.slice(0, targetIndex));
    }
    const revisedMessage: UserMessage & Readonly<{ messageRevision: number }> = {
      ...clone(original),
      runId: replacementRun.id,
      content: userInputContent(normalized),
      messageRevision: actualRevision + 1,
      sequenceWithinRun: 0,
      createdAt: timestamp,
    };
    this.storeMessage(revisedMessage);
    this.runs.set(replacementRun.id, replacementRun);
    this.touchRun(replacementRun);
    this.appendTransition(replacementRun, null, "queued");
    this.appendEvent({
      ...this.baseEvent(replacementRun),
      kind: "message_revised",
      message: revisedMessage,
      previousRevision: actualRevision,
      invalidatedRunIds: affectedRunIds,
      targetRunId: original.runId,
      cutoffSequenceWithinRun: original.sequenceWithinRun,
    } as MessageRevised);
    const result: MessageRevisionResult = {
      message: clone(revisedMessage),
      replacementRun: clone(replacementRun),
      invalidatedRunIds: affectedRunIds,
      affectedToolCallIds: affectedTools.map((toolCall) => toolCall.id),
      ...(effectDigest === undefined ? {} : { effectDigest }),
    };
    this.writeOperationReceipt(operationKey, operationPayload, result, replacementRun.id);
    return clone(result);
  }

  private commitInteractionRecord(
    run: StoredRun,
    interaction: RunInteraction,
    status: "answered" | "replied" | "cancelled",
    answer?: import("../runtime-events").JsonValue,
    reply?: string,
  ): InteractionRecord {
    const now = createTimestamp();
    const record: InteractionRecord = {
      id: interaction.id as unknown as MessageId,
      agentId: run.agentId,
      runId: run.id,
      role: "interaction",
      interactionId: interaction.id,
      kind: interaction.kind,
      prompt: interaction.prompt,
      phase: interaction.phase,
      status,
      ...(answer !== undefined ? { answer: clone(answer) } : {}),
      ...(reply !== undefined ? { reply } : {}),
      ...(interaction.toolCallId !== undefined ? { toolCallId: interaction.toolCallId as ToolCallId } : {}),
      ...(interaction.result !== undefined ? { result: clone(interaction.result) } : {}),
      sequenceWithinRun: this.nextMessageSequence(run.id),
      createdAt: now,
    };
    this.storeMessage(record);
    this.appendMessage(run, record);
    return record;
  }

  createRun(lease: OwnerLease, input: { agentId: AgentId; input: UserInput; metadata?: Metadata; phasePayload?: JsonValue; entryPhases?: readonly EntryPhaseSpec[]; pinnedConfigToken?: ConfigToken; idempotencyKey: string }): RunRecord {
    this.assertOwner(lease);
    this.requireAgent(input.agentId);
    if (input.phasePayload !== undefined && input.entryPhases !== undefined) {
      throw new TypeError("phasePayload and entryPhases are mutually exclusive");
    }
    const normalizedInput = normalizeUserInput(input.input);
    if (input.phasePayload !== undefined) assertJsonValue(input.phasePayload, "run.phasePayload");
    if (input.entryPhases !== undefined) assertEntryPhases(input.entryPhases, "run.entryPhases");
    const scope = createIdempotencyScope("start_run", input.agentId, input.idempotencyKey);
    const payload = canonicalStartRunRequest(normalizedInput, input.metadata, input.phasePayload, input.pinnedConfigToken, input.entryPhases);
    const replay = this.replay(scope, payload);
    if (replay) return clone(replay as RunRecord);

    const waitingRun = isControlMetadata(input.metadata)
      ? undefined
      : [...this.runs.values()].find((candidate) => candidate.agentId === input.agentId && candidate.state === "input_required");
    if (waitingRun) {
      const replyText = typeof normalizedInput === "string"
        ? normalizedInput
        : (typeof normalizedInput.content === "string"
          ? normalizedInput.content
          : normalizedInput.content.map((c) => c.type === "text" ? c.text : "").join(" "));
      const openInteractions = waitingRun.openInteractions ?? [];
      for (const interaction of openInteractions) {
        this.commitInteractionRecord(waitingRun, interaction, "replied", undefined, replyText);
      }
      delete waitingRun.openInteractions;
      waitingRun.interactionAnswers = {
        ...(waitingRun.interactionAnswers ?? {}),
        ...Object.fromEntries(openInteractions.map(({ id }) => [id, { status: "replied", reply: replyText }])),
      };

      if (waitingRun.checkpoint?.data && typeof waitingRun.checkpoint.data === "object") {
        const stored = (waitingRun.checkpoint.data as any).runInteractions ?? (waitingRun.checkpoint.data as any).phaseInteractions;
        if (stored?.requests && Array.isArray(stored.requests)) {
          for (const req of stored.requests) {
            req.status = "replied";
            req.reply = replyText;
          }
        }
      }

      const now = createTimestamp();
      const message: Message = {
        id: createId("msg") as MessageId,
        agentId: waitingRun.agentId,
        runId: waitingRun.id,
        role: "user",
        content: userInputContent(normalizedInput),
        ...(userInputMetadata(normalizedInput) ? { metadata: clone(userInputMetadata(normalizedInput)!) } : {}),
        sequenceWithinRun: this.nextMessageSequence(waitingRun.id),
        createdAt: now,
      };
      this.storeMessage(message);
      this.appendMessage(waitingRun, message);

      waitingRun.readySequence = this.nextReady(waitingRun.agentId);
      waitingRun.state = "queued";
      waitingRun.revision += 1;
      waitingRun.updatedAt = now;
      this.touchRun(waitingRun);
      this.appendTransition(waitingRun, "input_required", "queued");
      this.writeReceipt(scope, payload, waitingRun);
      return clone(waitingRun);
    }

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
      ...(input.phasePayload === undefined ? {} : { phasePayload: clone(input.phasePayload) }),
      ...(input.entryPhases === undefined ? {} : { entryPhases: clone(input.entryPhases) }),
      ...(input.pinnedConfigToken === undefined ? {} : { pinnedConfigToken: input.pinnedConfigToken }),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.runs.set(run.id, run);
    this.touchRun(run);
    this.appendTransition(run, null, "queued");
    this.writeReceipt(scope, payload, run);
    return clone(run);
  }

  claimRun(lease: OwnerLease, input: { runId: RunId; expectedRevision: number; executionId?: ExecutionId; messageId?: MessageId; configToken?: ConfigToken }): RunClaim {
    this.assertOwner(lease);
    const executionId = input.executionId ?? (createId("exec") as ExecutionId);
    const operationKey = `claim:${executionId}`;
    const operationPayload = canonicalJson([
      input.runId,
      input.expectedRevision,
      input.messageId ?? null,
      input.configToken ?? null,
    ] as never);
    const replay = this.replayOperation(operationKey, operationPayload);
    if (replay) return clone(replay as RunClaim);
    const run = this.requireRun(input.runId);
    this.assertRevision(run, input.expectedRevision);
    this.assertState(run, ["queued"]);
    if (!isControlRun(run) && [...this.runs.values()].some((candidate) => candidate.agentId === run.agentId && candidate.id !== run.id && candidate.agentSequence < run.agentSequence && !["completed", "failed", "cancelled"].includes(candidate.state))) {
      throw new RuntimeError("run_state_conflict", { runId: run.id, expected: ["queued"], actual: run.state });
    }
    if ([...this.runs.values()].some((candidate) => candidate.agentId === run.agentId
      && candidate.id !== run.id
      && (candidate.state === "running" || (!isControlRun(run) && candidate.state === "input_required")))) {
      throw new RuntimeError("run_state_conflict", { runId: run.id, expected: ["queued"], actual: run.state });
    }

    if (run.pinnedConfigToken && input.configToken && run.pinnedConfigToken !== input.configToken) {
      throw new RuntimeError("run_state_conflict", { runId: run.id, expected: ["queued"], actual: run.state });
    }
    if (!run.pinnedConfigToken && input.configToken) run.pinnedConfigToken = input.configToken;
    const committedMessages: Message[] = [];
    if (!run.checkpoint && !run.initialMessageId && (!isControlRun(run) || hasUserInput(run.input))) {
      const userInput = normalizeUserInput(run.input);
      const message: Message = {
        id: input.messageId ?? (createId("msg") as MessageId),
        agentId: run.agentId,
        runId: run.id,
        role: "user",
        content: userInputContent(userInput),
        ...(userInputMetadata(userInput) ? { metadata: clone(userInputMetadata(userInput)!) } : {}),
        sequenceWithinRun: this.nextMessageSequence(run.id),
        createdAt: createTimestamp(),
      };
      this.storeMessage(message);
      committedMessages.push(message);
    }
    const execution: ExecutionToken = {
      runId: run.id,
      ownerEpoch: lease.epoch,
      executionId,
    };
    run.state = "running";
    run.execution = execution;
    run.revision += 1;
    run.updatedAt = createTimestamp();
    this.touchRun(run);
    for (const message of committedMessages) this.appendMessage(run, message);
    this.appendTransition(run, "queued", "running");
    const result = { run: clone(run), execution: clone(execution), history: this.activeHistory(run.agentId, run.agentSequence) };
    this.writeOperationReceipt(operationKey, operationPayload, result, run.id);
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
    this.touchRun(run);
    this.appendTransition(run, "queued", "failed", { failure: input.failure });
    this.dropRunOperationReceipts(run.id);
    const result = clone(run);
    this.writeOperationReceipt(operationKey, operationPayload, result, run.id);
    return result;
  }

  commitPhaseEntered(lease: OwnerLease, input: { runId: RunId; execution: ExecutionToken; expectedRevision: number; phaseId: string; visit: number }): RunRecord {
    this.assertOwner(lease);
    if (input.phaseId.length === 0) throw new TypeError("phaseId must be non-empty");
    const operationKey = `phase_entered:${input.runId}:${input.execution.executionId}:${input.visit}`;
    const operationPayload = canonicalJson([input.phaseId, input.expectedRevision] as never);
    const replay = this.replayOperation(operationKey, operationPayload);
    if (replay) return clone(replay as RunRecord);
    const run = this.requireRun(input.runId);
    this.assertExecution(run, input.execution, input.expectedRevision);
    this.assertState(run, ["running"]);
    run.currentPhaseId = input.phaseId;
    run.revision += 1;
    run.updatedAt = createTimestamp();
    this.touchRun(run);
    const visit = this.events.filter((event) => event.runId === run.id && event.kind === "phase_entered").length + 1;
    this.appendEvent(this.baseEvent(run, { kind: "phase_entered", executionId: input.execution.executionId, phaseId: input.phaseId, visit } as import("../runtime-events").PhaseEntered) as import("../runtime-events").PhaseEntered);
    const result = clone(run);
    this.writeOperationReceipt(operationKey, operationPayload, result, run.id);
    return result;
  }

  /** Commit a parallel Phase's reply while its Run is still running. */
  commitPhaseOutput(lease: OwnerLease, input: { runId: RunId; execution: ExecutionToken; expectedRevision: number; message: AssistantMessage }): RunRecord {
    this.assertOwner(lease);
    const operationKey = `phase_output:${input.message.id}`;
    const operationPayload = canonicalJson([input.runId, input.execution.executionId, input.expectedRevision, input.message] as never);
    const replay = this.replayOperation(operationKey, operationPayload);
    if (replay) return clone(replay as RunRecord);
    const run = this.requireRun(input.runId);
    this.assertExecution(run, input.execution, input.expectedRevision);
    this.assertState(run, ["running"]);
    if (this.messages.has(input.message.id)) throw new RuntimeError("run_state_conflict", { runId: run.id, expected: ["running"], actual: run.state });
    const message: AssistantMessage = {
      ...clone(input.message),
      agentId: run.agentId,
      runId: run.id,
      role: "assistant",
      sequenceWithinRun: this.nextMessageSequence(run.id),
    };
    this.storeMessage(message);
    run.revision += 1;
    run.updatedAt = createTimestamp();
    this.touchRun(run);
    this.appendMessage(run, message);
    const result = clone(run);
    this.writeOperationReceipt(operationKey, operationPayload, result, run.id);
    return result;
  }

  commitInputRequired(lease: OwnerLease, input: {
    runId: RunId;
    execution: ExecutionToken;
    expectedRevision: number;
    phase: string;
    prompt?: AssistantMessage;
    checkpoint: ExecutionCheckpoint;
    interactions?: readonly RunInteraction[];
    interactionAnswers?: Readonly<Record<string, import("../runtime-events").JsonValue>>;
    pendingToolCallIds?: readonly ToolCallId[];
  }): RunRecord {
    this.assertOwner(lease);
    if (typeof input.phase !== "string" || input.phase.length === 0) throw new TypeError("phase must be non-empty");
    const operationKey = `input_required:${input.runId}:${input.execution.executionId}`;
    const interactions = input.interactions ?? [];
    const operationPayload = canonicalJson([input.runId, input.expectedRevision, input.phase, input.prompt ? input.prompt.id : null, input.checkpoint, interactions, input.interactionAnswers ?? null] as never);
    const replay = this.replayOperation(operationKey, operationPayload);
    if (replay) return clone(replay as RunRecord);
    const run = this.requireRun(input.runId);
    this.assertExecution(run, input.execution, input.expectedRevision);
    this.assertState(run, ["running"]);
    this.assertNoOpenTools(run, input.pendingToolCallIds ?? []);
    const isToolCallInteraction = interactions.length > 0 && interactions.some((interaction) => interaction.toolCallId !== undefined);
    let prompt: AssistantMessage | undefined;
    if (input.prompt && !isToolCallInteraction) {
      prompt = {
        ...clone(input.prompt),
        sequenceWithinRun: this.nextMessageSequence(run.id),
      };
      this.storeMessage(prompt);
    }
    run.state = "input_required";
    run.checkpoint = clone(input.checkpoint);
    if (interactions.length > 0) {
      run.openInteractions = clone(interactions);
      run.interactionAnswers = clone(input.interactionAnswers ?? run.interactionAnswers ?? {});
    } else {
      delete run.openInteractions;
      delete run.interactionAnswers;
    }
    this.dropClaimReceipt(run.execution);
    delete run.execution;
    run.revision += 1;
    run.updatedAt = createTimestamp();
    this.touchRun(run);
    if (prompt) {
      this.appendMessage(run, prompt);
    }
    this.appendTransition(run, "running", "input_required", { prompt, interactions, answers: run.interactionAnswers ?? {} });
    const result = clone(run);
    this.writeOperationReceipt(operationKey, operationPayload, result, run.id);
    return result;
  }

  answerInteraction(lease: OwnerLease, input: {
    runId: RunId;
    interactionId: string;
    expectedRevision: number;
    input?: import("../runtime-events").JsonValue;
    cancel?: boolean;
  }): RunRecord {
    this.assertOwner(lease);
    if (input.interactionId.trim().length === 0) throw new TypeError("interactionId must be non-empty");
    if (!input.cancel && input.input === undefined) throw new TypeError("respondInteraction requires input or cancel: true");
    const operationKey = `interaction_answer:${input.runId}:${input.interactionId}`;
    const operationPayload = canonicalJson([input.input ?? null, input.cancel ?? false] as never);
    const replay = this.replayOperation(operationKey, operationPayload);
    if (replay) return clone(replay as RunRecord);
    const run = this.requireRun(input.runId);
    this.assertRevision(run, input.expectedRevision);
    this.assertState(run, ["input_required"]);
    const openInteractions = run.openInteractions ?? [];
    const targetInteraction = openInteractions.find((interaction) => interaction.id === input.interactionId);
    if (!targetInteraction) {
      throw new RuntimeError("input_request_conflict", { runId: run.id, interactionId: input.interactionId, reason: "not_found" });
    }
    const isCancel = input.cancel === true;
    const status = isCancel ? "cancelled" : "answered";
    const now = createTimestamp();

    this.commitInteractionRecord(run, targetInteraction, status, isCancel ? undefined : input.input);

    if (run.checkpoint?.data && typeof run.checkpoint.data === "object") {
      const stored = (run.checkpoint.data as any).runInteractions ?? (run.checkpoint.data as any).phaseInteractions;
      if (stored?.requests && Array.isArray(stored.requests)) {
        const req = stored.requests.find((r: any) => r.id === input.interactionId);
        if (req) {
          req.status = status;
          if (!isCancel && input.input !== undefined) req.answer = clone(input.input);
        }
      }
    }

    run.openInteractions = openInteractions.filter((interaction) => interaction.id !== input.interactionId);
    if (!isCancel && input.input !== undefined) {
      run.interactionAnswers = {
        ...(run.interactionAnswers ?? {}),
        [input.interactionId]: clone(input.input),
      };
    }
    run.revision += 1;
    run.updatedAt = now;
    if (run.openInteractions.length === 0) {
      delete run.openInteractions;
      run.readySequence = this.nextReady(run.agentId);
      run.state = "queued";
      this.appendTransition(run, "input_required", "queued");
    }
    this.touchRun(run);
    const result = clone(run);
    this.writeOperationReceipt(operationKey, operationPayload, result, run.id);
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
    providerToolCallId?: string;
  }): ToolCommit {
    const providerToolCallId = input.providerToolCallId ?? (input.toolCallId ? String(input.toolCallId) : createId("provider"));
    const result = this.reserveToolCalls(lease, {
      runId: input.runId,
      execution: input.execution,
      expectedRevision: input.expectedRevision,
      requestMessageId: input.requestMessageId,
      calls: [{
        providerToolCallId,
        name: input.name,
        args: input.args,
        ...(input.toolCallId === undefined ? {} : { toolCallId: input.toolCallId }),
      }],
    });
    return { run: result.run, toolCall: result.toolCalls[0]! };
  }

  reserveToolCalls(lease: OwnerLease, input: {
    runId: RunId;
    execution: ExecutionToken;
    expectedRevision: number;
    requestMessageId: MessageId;
    calls: readonly ToolCallReservation[];
    /** The model response's blocks, so the request message keeps what preceded the Tool Calls. */
    contentBlocks?: readonly ContentBlock[];
  }): ToolBatchCommit {
    this.assertOwner(lease);
    if (input.calls.length === 0) throw new TypeError("calls must be non-empty");
    const providerIds = new Set<string>();
    const durableIds = new Set<ToolCallId>();
    for (const call of input.calls) {
      if (call.providerToolCallId.trim().length === 0) throw new TypeError("providerToolCallId must be non-empty");
      if (providerIds.has(call.providerToolCallId)) throw new TypeError("Tool provider IDs must be unique within one response");
      providerIds.add(call.providerToolCallId);
      assertToolValue(call.args, "tool.args");
      if (call.toolCallId !== undefined) {
        if (durableIds.has(call.toolCallId)) throw new TypeError("Tool Call IDs must be unique within one response");
        durableIds.add(call.toolCallId);
      }
    }
    const operationKey = `tool_reserve_batch:${input.requestMessageId}`;
    const operationPayload = canonicalJson([
      input.runId,
      input.expectedRevision,
      input.execution.executionId,
      input.requestMessageId,
      input.calls,
      input.contentBlocks ?? null,
    ] as never);
    const replay = this.replayOperation(operationKey, operationPayload);
    if (replay) return clone(replay as ToolBatchCommit);
    const run = this.requireRun(input.runId);
    this.assertExecution(run, input.execution, input.expectedRevision);
    if (this.messages.has(input.requestMessageId)) throw new RuntimeError("run_state_conflict", { runId: run.id, expected: ["running"], actual: run.state });
    const timestamp = createTimestamp();
    const toolCalls: StoredToolCall[] = input.calls.map((call) => ({
      id: call.toolCallId ?? (createId("tool") as ToolCallId),
      providerToolCallId: call.providerToolCallId,
      agentId: run.agentId,
      runId: run.id,
      executionId: input.execution.executionId,
      requestMessageId: input.requestMessageId,
      name: call.name,
      args: clone(call.args),
      state: "pending",
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
    for (const toolCall of toolCalls) {
      if (this.toolCalls.has(toolCall.id)) throw new RuntimeError("run_state_conflict", { runId: run.id, expected: ["running"], actual: run.state });
    }
    const requestMessage: AssistantMessage = {
      id: input.requestMessageId,
      agentId: run.agentId,
      runId: run.id,
      role: "assistant",
      content: requestMessageContent(toolCalls, input.contentBlocks),
      sequenceWithinRun: this.nextMessageSequence(run.id),
      createdAt: timestamp,
    };
    for (const toolCall of toolCalls) this.storeToolCall(toolCall);
    this.storeMessage(requestMessage);
    run.revision += 1;
    run.updatedAt = timestamp;
    this.touchRun(run);
    this.appendMessage(run, requestMessage);
    for (const toolCall of toolCalls) this.appendToolTransition(run, { from: null, to: "pending" }, toolCall);
    const result: ToolBatchCommit = {
      run: clone(run),
      toolCalls: toolCalls.map((toolCall) => clone(toolCall) as unknown as ToolCallSnapshot),
    };
    this.writeOperationReceipt(operationKey, operationPayload, result, run.id);
    return result;
  }

  startToolCall(lease: OwnerLease, input: {
    runId: RunId;
    execution: ExecutionToken;
    expectedRevision: number;
    toolCallId: ToolCallId;
  }): ToolCommit {
    this.assertOwner(lease);
    const operationKey = `tool_start:${input.toolCallId}:${input.execution.executionId}`;
    const operationPayload = canonicalJson([input.runId, input.expectedRevision, input.execution.executionId] as never);
    const replay = this.replayOperation(operationKey, operationPayload);
    if (replay) return clone(replay as ToolCommit);
    const run = this.requireRun(input.runId);
    this.assertExecution(run, input.execution, input.expectedRevision);
    const toolCall = this.requireToolCall(input.toolCallId, run);
    if (toolCall.state !== "pending") throw new RuntimeError("run_state_conflict", { runId: run.id, expected: ["running"], actual: run.state });
    toolCall.state = "running";
    toolCall.executionId = input.execution.executionId;
    toolCall.updatedAt = createTimestamp();
    this.storeToolCall(toolCall);
    run.revision += 1;
    run.updatedAt = toolCall.updatedAt;
    this.touchRun(run);
    this.appendToolTransition(run, { from: "pending", to: "running" }, toolCall);
    const result: ToolCommit = { run: clone(run), toolCall: clone(toolCall) as unknown as ToolCallSnapshot };
    this.writeOperationReceipt(operationKey, operationPayload, result, run.id);
    return result;
  }

  suspendToolCall(lease: OwnerLease, input: {
    runId: RunId;
    execution: ExecutionToken;
    expectedRevision: number;
    toolCallId: ToolCallId;
  }): ToolCommit {
    this.assertOwner(lease);
    const operationKey = `tool_suspend:${input.toolCallId}:${input.execution.executionId}`;
    const operationPayload = canonicalJson([input.runId, input.expectedRevision, input.execution.executionId] as never);
    const replay = this.replayOperation(operationKey, operationPayload);
    if (replay) return clone(replay as ToolCommit);
    const run = this.requireRun(input.runId);
    this.assertExecution(run, input.execution, input.expectedRevision);
    const toolCall = this.requireToolCall(input.toolCallId, run);
    if (toolCall.state !== "running" || toolCall.executionId !== input.execution.executionId) {
      throw new RuntimeError("run_state_conflict", { runId: run.id, expected: ["running"], actual: run.state });
    }
    toolCall.state = "pending";
    toolCall.updatedAt = createTimestamp();
    this.storeToolCall(toolCall);
    run.revision += 1;
    run.updatedAt = toolCall.updatedAt;
    this.touchRun(run);
    this.appendToolTransition(run, { from: "running", to: "pending" }, toolCall);
    const result: ToolCommit = { run: clone(run), toolCall: clone(toolCall) as unknown as ToolCallSnapshot };
    this.writeOperationReceipt(operationKey, operationPayload, result, run.id);
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
      content: [{ type: "tool_result", toolCallId: toolCall.id, providerToolCallId: toolCall.providerToolCallId, result: clone(input.result) }],
      sequenceWithinRun: this.nextMessageSequence(run.id),
      createdAt: createTimestamp(),
    };
    this.storeMessage(message);
    toolCall.state = input.state;
    toolCall.result = durableResult;
    toolCall.resultMessageId = resultMessageId;
    if (input.state === "indeterminate") toolCall.reason = input.reason!;
    else delete toolCall.reason;
    toolCall.updatedAt = message.createdAt;
    this.storeToolCall(toolCall);
    run.revision += 1;
    run.updatedAt = message.createdAt;
    this.touchRun(run);
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
      this.dropClaimReceipt(run.execution);
      delete run.execution;
      run.revision += 1;
      run.updatedAt = createTimestamp();
      this.touchRun(run);
      this.appendTransition(run, "running", "failed", { failure });
      this.dropRunOperationReceipts(run.id);
    }
    const result: ToolCommit = { run: clone(run), toolCall: clone(toolCall) as unknown as ToolCallSnapshot };
    this.writeOperationReceipt(operationKey, operationPayload, result, run.id);
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
      this.storeMessage(output);
      this.appendMessage(run, output);
    }
    run.state = nextState;
    if (input.outcome) run.outcome = clone(input.outcome);
    if (input.failure) run.failure = clone(input.failure);
    this.dropClaimReceipt(run.execution);
    delete run.execution;
    delete run.openInteractions;
    delete run.interactionAnswers;
    run.revision += 1;
    run.updatedAt = createTimestamp();
    this.touchRun(run);
    this.appendTransition(run, "running", nextState, { outcome: input.outcome, failure: input.failure, output });
    this.dropRunOperationReceipts(run.id);
    const result = clone(run);
    return result;
  }

  cancelRun(lease: OwnerLease, input: { runId: RunId; expectedRevision?: number; reason?: string; output?: AssistantMessage }): RunRecord {
    this.assertOwner(lease);
    const operationKey = `cancel:${input.runId}:${input.expectedRevision ?? "current"}`;
    const operationPayload = canonicalJson([input.reason ?? null, input.output ?? null] as never);
    const replay = this.replayOperation(operationKey, operationPayload);
    if (replay) return clone(replay as RunRecord);
    const run = this.requireRun(input.runId);
    if (input.expectedRevision !== undefined) this.assertRevision(run, input.expectedRevision);
    if (input.output !== undefined) {
      const existing = this.messages.get(input.output.id);
      if (existing && existing.runId !== run.id) throw new TypeError("cancelled output message id belongs to another Run");
      if (!isAssistantMessage(input.output) || input.output.agentId !== run.agentId || input.output.runId !== run.id || input.output.interrupted !== true) {
        throw new TypeError("cancelled output must be an interrupted AssistantMessage from this Run");
      }
    }
    if (["completed", "failed", "cancelled"].includes(run.state)) {
      const result = clone(run);
      return result;
    }
    const from = run.state;
      const activeToolCalls = run.execution
        ? [...this.toolCalls.values()].filter((toolCall) => toolCall.runId === run.id && toolCall.executionId === run.execution?.executionId && (toolCall.state === "pending" || toolCall.state === "running"))
        : run.state === "input_required" && run.checkpoint?.data && typeof run.checkpoint.data === "object" && !Array.isArray(run.checkpoint.data)
          ? (() => {
              const interactionState = (run.checkpoint!.data as Record<string, import("../runtime-events").JsonValue>).runInteractions;
              const interactionCheckpoint = interactionState && typeof interactionState === "object" && !Array.isArray(interactionState)
                ? (interactionState as Record<string, import("../runtime-events").JsonValue>).checkpoint
                : undefined;
              const ids = interactionCheckpoint && typeof interactionCheckpoint === "object" && !Array.isArray(interactionCheckpoint)
                ? (interactionCheckpoint as Record<string, import("../runtime-events").JsonValue>).toolCallIds
                : undefined;
              const allowed = new Set(Array.isArray(ids) ? ids : []);
              return [...this.toolCalls.values()].filter((toolCall) => toolCall.runId === run.id && toolCall.state === "pending" && allowed.has(toolCall.id));
            })()
          : [];
    const indeterminateToolCallIds = activeToolCalls
      .filter((toolCall) => toolCall.state === "running")
      .map((toolCall) => toolCall.id);
    for (const toolCall of activeToolCalls) this.interruptToolCall(run, toolCall, input.reason ?? "The Run was cancelled.");
    if (input.output && (typeof input.output.content === "string" ? input.output.content.length > 0 : input.output.content.length > 0)) {
      const output = { ...clone(input.output), sequenceWithinRun: this.nextMessageSequence(run.id) };
      this.storeMessage(output);
      this.appendMessage(run, output);
    }
    if (run.openInteractions && run.openInteractions.length > 0) {
      for (const interaction of run.openInteractions) {
        this.commitInteractionRecord(run, interaction, "cancelled");
      }
    }
    if (indeterminateToolCallIds.length > 0) {
      const failure: RunFailure = {
        code: "tool_indeterminate",
        message: input.reason ?? "The Run was cancelled while a Tool effect was in flight.",
        toolCallIds: indeterminateToolCallIds as [ToolCallId, ...ToolCallId[]],
      };
      run.state = "failed";
      run.failure = failure;
      delete run.cancellationReason;
      this.dropClaimReceipt(run.execution);
      delete run.execution;
      delete run.openInteractions;
      delete run.interactionAnswers;
      run.revision += 1;
      run.updatedAt = createTimestamp();
      this.touchRun(run);
      this.appendTransition(run, from, "failed", { failure });
      this.dropRunOperationReceipts(run.id);
      const result = clone(run);
      return result;
    }
    run.state = "cancelled";
    run.cancellationReason = input.reason;
    this.dropClaimReceipt(run.execution);
    delete run.execution;
    delete run.openInteractions;
    delete run.interactionAnswers;
    run.revision += 1;
    run.updatedAt = createTimestamp();
    this.touchRun(run);
    this.appendTransition(run, from, "cancelled", { reason: input.reason });
    this.dropRunOperationReceipts(run.id);
    const result = clone(run);
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
      ...(run.phasePayload === undefined ? {} : { phasePayload: clone(run.phasePayload) }),
      ...(run.entryPhases === undefined ? {} : { entryPhases: clone(run.entryPhases) }),
      messageCount: this.messagesForRun(run.id).length,
      toolCallCount: [...this.toolCalls.values()].filter((toolCall) => toolCall.runId === run.id).length,
      ...(run.currentPhaseId === undefined ? {} : { currentPhaseId: run.currentPhaseId }),
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      cursor: this.cursorForRun(run.id),
    };
    switch (run.state) {
      case "queued":
      case "running": return { ...base, state: run.state };
      case "input_required": {
        return {
          ...base,
          state: "input_required",
          interactions: clone(run.openInteractions ?? []),
          answers: clone(run.interactionAnswers ?? {}),
        };
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
    const after = input.after ? this.parseCursor(input.after) : this.retentionFloor - 1;
    if (input.after && after < this.retentionFloor - 1) {
      throw new RuntimeError("invalid_cursor", { cursorType: "event", reason: "expired" });
    }
    if (after > this.eventSequence) {
      throw new RuntimeError("invalid_cursor", { cursorType: "event", reason: "beyond_waterline" });
    }
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
    if (next < this.retentionFloor - 1) {
      throw new RuntimeError("invalid_cursor", { cursorType: "event", reason: "expired" });
    }
    if (next > this.eventSequence) throw new RuntimeError("invalid_cursor", { cursorType: "event", reason: "beyond_waterline" });
    const previous = this.consumerCheckpoints.get(input.consumerId);
    if (previous !== undefined && next <= this.parseCursor(previous)) return;
    this.consumerCheckpoints.set(input.consumerId, input.cursor);
    this.recorder?.onConsumerCheckpointUpsert(input.consumerId, input.cursor);
  }

  compact(lease: OwnerLease, input: { now?: string; retentionMs?: number } = {}): RetentionResult {
    this.assertOwner(lease);
    const retentionMs = input.retentionMs ?? 7 * 24 * 60 * 60 * 1000;
    if (!Number.isFinite(retentionMs) || retentionMs < 0) {
      throw new TypeError("retentionMs must be a non-negative finite number");
    }
    const now = input.now === undefined ? Date.now() : Date.parse(input.now);
    if (!Number.isFinite(now)) throw new TypeError("now must be an ISO timestamp");
    const cutoff = now - retentionMs;
    const checkpointSequences = [...this.consumerCheckpoints.values()]
      .map((cursor) => this.parseCursor(cursor));
    const consumerFloor = checkpointSequences.length > 0
      ? Math.min(...checkpointSequences)
      : this.eventSequence;
    const blockedRunIds = new Set<RunId>();
    for (const run of this.runs.values()) {
      if (run.state === "running") blockedRunIds.add(run.id);
    }
    for (const tool of this.toolCalls.values()) {
      if (tool.state === "pending" || tool.state === "running" || tool.state === "indeterminate") {
        blockedRunIds.add(tool.runId);
      }
    }

    let deleteThrough = this.retentionFloor - 1;
    for (const event of this.events) {
      const sequence = this.parseCursor(event.cursor);
      if (sequence < this.retentionFloor) continue;
      if (sequence > consumerFloor) break;
      if (Date.parse(event.createdAt) > cutoff || blockedRunIds.has(event.runId)) break;
      // Keep events that still back the active Agent projection. Only
      // an invalidated, terminal suffix is disposable; deleting events from
      // a live Run would erase its tool/activity history before deletion.
      const eventRun = this.runs.get(event.runId);
      if (
        !eventRun
        || eventRun.invalidatedBy === undefined
        || !["completed", "failed", "cancelled"].includes(eventRun.state)
        || Date.parse(eventRun.updatedAt) > cutoff
      ) break;
      deleteThrough = sequence;
    }
    const deletedEvents = deleteThrough >= this.retentionFloor
      ? this.events.filter((event) => this.parseCursor(event.cursor) <= deleteThrough)
      : [];
    if (deleteThrough >= this.retentionFloor) {
      const deletedEventIds = this.events
        .filter((event) => this.parseCursor(event.cursor) <= deleteThrough)
        .map((event) => event.id);
      this.events.splice(0, this.events.length, ...this.events.filter((event) => this.parseCursor(event.cursor) > deleteThrough));
      this.retentionFloor = deleteThrough + 1;
      this.recorder?.onRetentionFloorChange(this.retentionFloor);
      this.recorder?.onEventsTruncate(deletedEventIds);
      for (const [consumerId, cursor] of this.consumerCheckpoints) {
        if (this.parseCursor(cursor) < this.retentionFloor - 1) {
          this.consumerCheckpoints.delete(consumerId);
          this.recorder?.onConsumerCheckpointDelete(consumerId);
        }
      }
    }

    const activeMessageRunIds = new Set([...this.messages.values()].map((message) => message.runId));
    const deletableRuns = [...this.runs.values()].filter((run) =>
      run.invalidatedBy !== undefined
      && ["completed", "failed", "cancelled"].includes(run.state)
      && Date.parse(run.updatedAt) <= cutoff
      && !activeMessageRunIds.has(run.id)
      && !blockedRunIds.has(run.id)
      && this.events
        .filter((event) => event.runId === run.id)
        .every((event) => this.parseCursor(event.cursor) <= consumerFloor && Date.parse(event.createdAt) <= cutoff));
    const deletedRunIds = deletableRuns.map((run) => run.id);
    const deletedRunSet = new Set(deletedRunIds);
    const deletedTools = [...this.toolCalls.values()].filter((tool) => deletedRunSet.has(tool.runId));
    for (const runId of deletedRunIds) {
      this.runs.delete(runId);
      this.runReceiptKeys.delete(runId);
      this.recorder?.onRunDelete(runId);
    }
    for (const [messageId, message] of this.messages) {
      if (deletedRunSet.has(message.runId)) {
        this.messages.delete(messageId);
        this.recorder?.onMessageDelete(messageId);
      }
    }
    for (const tool of deletedTools) {
      this.toolCalls.delete(tool.id);
      this.recorder?.onToolCallDelete(tool.id);
    }
    return {
      deletedRunIds,
      deletedToolCallIds: deletedTools.map((tool) => tool.id),
      deletedEventCount: deletedEvents.length,
      retentionFloor: `${this.incarnation}:${this.retentionFloor}` as EventCursor,
      ...(deletedRunIds.length === 0 && deletedEvents.length === 0
        ? { skipped: "no_eligible_events" as const }
        : {}),
    };
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
    const key = encodeIdempotencyScope(this.incarnation, scope as never);
    const receipt = { payload, result: clone(result) };
    this.idempotency.set(key, receipt);
    this.recorder?.onIdempotencyUpsert(key, receipt);
  }

  private replayOperation(key: string, payload: string): unknown | undefined {
    const receipt = this.operationReceipts.get(key);
    if (!receipt) return undefined;
    if (receipt.payload !== payload) throw new Error(`Idempotency payload conflict for ${key}.`);
    return receipt.result;
  }

  private writeOperationReceipt(key: string, payload: string, result: unknown, runId?: RunId): void {
    const receipt = { payload, result: clone(result) };
    this.operationReceipts.set(key, receipt);
    const resolvedRunId = runId ?? this.inferRunIdForReceipt(key, payload);
    if (resolvedRunId) {
      let keys = this.runReceiptKeys.get(resolvedRunId);
      if (!keys) {
        keys = new Set();
        this.runReceiptKeys.set(resolvedRunId, keys);
      }
      keys.add(key);
    }
    this.recorder?.onOperationReceiptUpsert(key, receipt);
  }

  /**
   * A Claim receipt exists for idempotent replay of one live Execution Attempt
   * and carries that Attempt's history. Dropping it when the Attempt ends keeps
   * one history snapshot per Agent instead of one per Attempt.
   */
  private dropClaimReceipt(execution: ExecutionToken | undefined): void {
    if (execution) {
      const key = `claim:${execution.executionId}`;
      this.operationReceipts.delete(key);
      this.recorder?.onOperationReceiptDelete(key);
    }
  }

  /**
   * A new owner fences the Execution Attempts of the previous one, so no Claim
   * receipt from before the takeover can be replayed. Sweeping them reclaims
   * the history snapshots a store accumulated while no Attempt ended under
   * this Runtime.
   */
  dropSettledClaimReceipts(): void {
    const liveExecutions = new Set<string>();
    for (const run of this.runs.values()) {
      if (run.state === "running" && run.execution) liveExecutions.add(String(run.execution.executionId));
    }
    for (const key of [...this.operationReceipts.keys()]) {
      if (key.startsWith("claim:") && !liveExecutions.has(key.slice("claim:".length))) {
        this.operationReceipts.delete(key);
        this.recorder?.onOperationReceiptDelete(key);
      }
    }
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

  private assertNoOpenTools(run: StoredRun, allowedPendingToolCallIds: readonly ToolCallId[] = []): void {
    const allowed = new Set(allowedPendingToolCallIds);
    if ([...this.toolCalls.values()].some((toolCall) => toolCall.runId === run.id
      && (toolCall.state === "running" || (toolCall.state === "pending" && !allowed.has(toolCall.id))))) {
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
      content: [{ type: "tool_result", toolCallId: toolCall.id, providerToolCallId: toolCall.providerToolCallId, result }],
      sequenceWithinRun: this.nextMessageSequence(run.id),
      createdAt: createTimestamp(),
    };
    const from = toolCall.state as "pending" | "running";
    const to = from === "running" ? "indeterminate" : "failed";
    this.storeMessage(message);
    toolCall.state = to;
    toolCall.result = durableResult;
    toolCall.resultMessageId = message.id;
    if (to === "indeterminate") toolCall.reason = reason;
    toolCall.updatedAt = message.createdAt;
    this.storeToolCall(toolCall);
    run.revision += 1;
    run.updatedAt = message.createdAt;
    this.touchRun(run);
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

  history(lease: OwnerLease, agentId: AgentId): readonly Message[] {
    this.assertOwner(lease);
    this.requireAgent(agentId);
    return this.activeHistory(agentId, Number.MAX_SAFE_INTEGER);
  }

  contextStatus(lease: OwnerLease, agentId: AgentId, contextWindow: number): ContextStatus {
    this.assertOwner(lease);
    this.requireAgent(agentId);
    if (!Number.isFinite(contextWindow) || contextWindow <= 0) {
      throw new TypeError("contextWindow must be a positive finite number");
    }
    const messages = this.contextMessages(lease, agentId);
    const tokens = estimateMessageTokens(messages);
    const record = this.contextCompactions.get(agentId);
    const thresholdTokens = Math.max(0, Math.floor(contextWindow) - 16_384);
    return {
      tokens,
      contextWindow: Math.floor(contextWindow),
      percent: Math.round((tokens / contextWindow) * 100),
      thresholdTokens,
      estimated: true,
      ...(record?.coveredThrough ? { coveredThrough: clone(record.coveredThrough) } : {}),
    };
  }

  contextMessages(
    lease: OwnerLease,
    agentId: AgentId,
    recentTokenBudget = 20_000,
  ): readonly Message[] {
    this.assertOwner(lease);
    this.requireAgent(agentId);
    if (!Number.isFinite(recentTokenBudget) || recentTokenBudget <= 0) {
      throw new TypeError("recentTokenBudget must be a positive finite number");
    }
    const history = this.activeHistory(agentId, Number.MAX_SAFE_INTEGER);
    const record = this.contextCompactions.get(agentId);
    if (!record) return history;
    const coveredIndex = record.coveredThrough
      ? history.findIndex((message) => message.id === record.coveredThrough!.messageId)
      : -1;
    const suffix = coveredIndex >= 0 ? history.slice(coveredIndex + 1) : history;
    const recent: Message[] = [];
    let tokens = 0;
    for (let index = suffix.length - 1; index >= 0; index -= 1) {
      const message = suffix[index]!;
      const messageTokens = estimateMessageTokens([message]);
      if (recent.length > 0 && tokens + messageTokens > recentTokenBudget) break;
      recent.unshift(message);
      tokens += messageTokens;
    }
    const covered = record.coveredThrough
      ? history.find((message) => message.id === record.coveredThrough!.messageId)
      : undefined;
    const summary: Message = {
      id: `context-summary:${record.id}` as MessageId,
      agentId,
      runId: (covered?.runId ?? history.at(-1)?.runId ?? `context:${agentId}`) as RunId,
      role: "assistant",
      content: `[Context summary]\n\n${record.summary}`,
      sequenceWithinRun: covered?.sequenceWithinRun ?? 0,
      createdAt: record.createdAt,
      metadata: { kind: "context_summary", compactionId: record.id },
    };
    return [summary, ...recent];
  }

  commitContextCompaction(lease: OwnerLease, record: ContextCompactionRecord): ContextCompactionRecord {
    this.assertOwner(lease);
    this.requireAgent(record.agentId);
    if (record.id.trim().length === 0 || record.summary.trim().length === 0) {
      throw new TypeError("context compaction id and summary must be non-empty");
    }
    const existing = this.contextCompactions.get(record.agentId);
    if (existing?.id === record.id) return clone(existing);
    const next = clone(record);
    this.contextCompactions.set(record.agentId, next);
    this.recorder?.onContextCompactionUpsert(record.agentId, next);
    return clone(next);
  }

  private activeHistory(agentId: AgentId, beforeSequence: number): readonly Message[] {
    return clone([
      ...(this.historySeeds.get(agentId) ?? []),
      ...[...this.runs.values()]
      .filter((run) => run.agentId === agentId && run.agentSequence <= beforeSequence)
      .sort((a, b) => a.agentSequence - b.agentSequence)
      .flatMap((run) => this.messagesForRun(run.id))
    ].map((message) => ({ ...message, messageRevision: message.messageRevision ?? 0 })));
  }

  private appendMessage(run: StoredRun, message: Message): void {
    this.appendEvent(this.baseEvent(run, {
      kind: "message_committed",
      message,
    } as MessageCommitted) as MessageCommitted);
  }

  private appendTransition(
    run: StoredRun,
    from: RunState | null,
    to: RunState,
    options?: {
      prompt?: AssistantMessage;
      outcome?: Outcome;
      output?: AssistantMessage;
      failure?: RunFailure;
      reason?: string;
      interactions?: readonly RunInteraction[];
      answers?: Readonly<Record<string, import("../runtime-events").JsonValue>>;
    },
  ): void {
    const transition: RunStateChanged = {
      ...this.baseEvent(run),
      kind: "run_state_changed",
      from,
      to,
      ...(to === "input_required" ? { interactions: clone(options?.interactions ?? []), answers: clone(options?.answers ?? {}) } : {}),
      ...(to === "completed" && options?.outcome ? { outcome: options.outcome, ...(options.output ? { output: options.output } : {}) } : {}),
      ...(to === "failed" && options?.failure ? { failure: options.failure as never } : {}),
      ...(to === "cancelled" && options?.reason ? { reason: options.reason } : {}),
    } as RunStateChanged;
    // A transition always rewrites the Run, so record it here rather than
    // relying on every caller to remember the incremental-persist hook.
    this.touchRun(run);
    this.appendEvent(transition);
  }

  private appendToolTransition(run: StoredRun, transition: { from: null | "pending" | "running"; to: "pending" | "running" | "completed" | "failed" | "indeterminate" }, toolCall: StoredToolCall): void {
    this.appendEvent(this.baseEvent(run, {
      kind: "tool_state_changed",
      transition,
      toolCall: clone(toolCall) as unknown as ToolCallSnapshot,
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
      ...(run.metadata ? { metadata: clone(run.metadata) } : {}),
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

  async reserveAgent(input: { idempotencyKey: string; metadata?: Metadata; configIdentity?: string; historySeed?: HistorySeed }): Promise<AgentRecord> { return this.store.reserveAgent(this.lease, input); }
  async activateAgent(agentId: AgentId, configToken?: ConfigToken, configIdentity?: string): Promise<AgentRecord> { return this.store.activateAgent(this.lease, agentId, configToken, configIdentity); }
  async updateAgentConfigToken(input: { agentId: AgentId; token: ConfigToken; configIdentity?: string; idempotencyKey: string }): Promise<AgentRecord> { return this.store.updateAgentConfigToken(this.lease, input); }
  async deleteAgent(input: AgentDeletionRequest): Promise<void> { this.store.deleteAgent(this.lease, input); }
  async reviseMessage(input: {
    agentId: AgentId;
    messageId: MessageId;
    expectedMessageRevision: number;
    content: UserContent;
    operationId: string;
    effectDigestConfirmation?: string;
  }): Promise<MessageRevisionResult> { return this.store.reviseMessage(this.lease, input); }
  async compact(input?: { now?: string; retentionMs?: number }): Promise<RetentionResult> {
    return this.store.compact(this.lease, input);
  }
  async contextStatus(agentId: AgentId, contextWindow: number): Promise<ContextStatus> {
    return this.store.contextStatus(this.lease, agentId, contextWindow);
  }
  async contextMessages(agentId: AgentId, recentTokenBudget?: number): Promise<readonly Message[]> {
    return this.store.contextMessages(this.lease, agentId, recentTokenBudget);
  }
  async commitContextCompaction(record: ContextCompactionRecord): Promise<ContextCompactionRecord> {
    return this.store.commitContextCompaction(this.lease, record);
  }
  async createRun(input: { agentId: AgentId; input: UserInput; metadata?: Metadata; phasePayload?: JsonValue; entryPhases?: readonly EntryPhaseSpec[]; pinnedConfigToken?: ConfigToken; idempotencyKey: string }): Promise<RunRecord> { return this.store.createRun(this.lease, input); }
  async claimRun(input: { runId: RunId; expectedRevision: number; executionId?: ExecutionId; messageId?: MessageId; configToken?: ConfigToken; inputContext?: UserInput }): Promise<RunClaim> { return this.store.claimRun(this.lease, input); }
  async failQueuedRun(input: { runId: RunId; expectedRevision: number; failure: Extract<RunFailure, { code: "configuration_unavailable" | "checkpoint_incompatible" }> }): Promise<RunRecord> { return this.store.failQueuedRun(this.lease, input); }
  async commitPhaseEntered(input: { runId: RunId; execution: ExecutionToken; expectedRevision: number; phaseId: string; visit: number }): Promise<RunRecord> { return this.store.commitPhaseEntered(this.lease, input); }
  async commitPhaseOutput(input: { runId: RunId; execution: ExecutionToken; expectedRevision: number; message: AssistantMessage }): Promise<RunRecord> { return this.store.commitPhaseOutput(this.lease, input); }
  async commitInputRequired(input: { runId: RunId; execution: ExecutionToken; expectedRevision: number; phase: string; prompt?: AssistantMessage; checkpoint: ExecutionCheckpoint; interactions?: readonly RunInteraction[]; interactionAnswers?: Readonly<Record<string, import("../runtime-events").JsonValue>>; pendingToolCallIds?: readonly ToolCallId[] }): Promise<RunRecord> { return this.store.commitInputRequired(this.lease, input); }
  async answerInteraction(input: { runId: RunId; interactionId: string; expectedRevision: number; input?: import("../runtime-events").JsonValue; cancel?: boolean }): Promise<RunRecord> { return this.store.answerInteraction(this.lease, input); }
  async commitOutcome(input: { runId: RunId; execution: ExecutionToken; expectedRevision: number; outcome?: Outcome; failure?: RunFailure; output?: AssistantMessage }): Promise<RunRecord> { return this.store.commitOutcome(this.lease, input); }
  async reserveToolCall(input: { runId: RunId; execution: ExecutionToken; expectedRevision: number; requestMessageId: MessageId; name: string; args: import("../runtime-events").JsonValue; toolCallId?: ToolCallId; providerToolCallId?: string }): Promise<ToolCommit> { return this.store.reserveToolCall(this.lease, input); }
  async reserveToolCalls(input: { runId: RunId; execution: ExecutionToken; expectedRevision: number; requestMessageId: MessageId; calls: readonly Readonly<{ providerToolCallId: string; name: string; args: import("../runtime-events").JsonValue; toolCallId?: ToolCallId }>[]; contentBlocks?: readonly ContentBlock[] }): Promise<import("./contracts").ToolBatchCommit> { return this.store.reserveToolCalls(this.lease, input); }
  async startToolCall(input: { runId: RunId; execution: ExecutionToken; expectedRevision: number; toolCallId: ToolCallId }): Promise<ToolCommit> { return this.store.startToolCall(this.lease, input); }
  async suspendToolCall(input: { runId: RunId; execution: ExecutionToken; expectedRevision: number; toolCallId: ToolCallId }): Promise<ToolCommit> { return this.store.suspendToolCall(this.lease, input); }
  async commitToolResult(input: { runId: RunId; execution: ExecutionToken; expectedRevision: number; toolCallId: ToolCallId; result: ToolExecutionResult; state: "completed" | "failed" | "indeterminate"; reason?: string }): Promise<ToolCommit> { return this.store.commitToolResult(this.lease, input); }
  async cancelRun(input: { runId: RunId; expectedRevision?: number; reason?: string; output?: AssistantMessage }): Promise<RunRecord> { return this.store.cancelRun(this.lease, input); }
  async snapshotRun(runId: RunId): Promise<RunSnapshot> { return this.store.snapshotRun(this.lease, runId); }
  async history(agentId: AgentId): Promise<readonly Message[]> { return this.store.history(this.lease, agentId); }
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

function hasUserInput(input: UserInput): boolean {
  const content = userInputContent(input);
  return content.length > 0;
}

function userInputMetadata(input: UserInput): Metadata | undefined {
  return typeof input === "string" ? undefined : input.metadata;
}

function isControlMetadata(metadata?: Metadata): boolean {
  const rowan = metadata?.rowan;
  return typeof rowan === "object"
    && rowan !== null
    && typeof (rowan as { kind?: unknown }).kind === "string"
    && (rowan as { kind: string }).kind.length > 0;
}

function isControlRun(run: RunRecord): boolean {
  return isControlMetadata(run.metadata);
}

function estimateMessageTokens(messages: readonly Message[]): number {
  let characters = 0;
  for (const message of messages) {
    if (message.role === "interaction") {
      characters += (message.prompt?.length ?? 0)
        + (message.answer !== undefined ? JSON.stringify(message.answer).length : 0)
        + (message.reply?.length ?? 0);
    } else {
      characters += messageContentText(message.content).length;
    }
    characters += 20;
  }
  return Math.ceil(characters / 4);
}

function messageContentText(content: unknown): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part: any) => {
    if (part && typeof part === "object") {
      if (part.type === "text") return part.text ?? "";
      if (part.type === "thinking") return part.thinking ?? "";
      if (part.type === "tool_use") return JSON.stringify(part.input);
      if (part.type === "tool_result") return JSON.stringify(part.result);
      if (part.type === "image") return `[image:${part.mimeType}]`;
    }
    return "";
  }).join("\n");
}

function targetInput(input: UserInput, metadata: Metadata | undefined): UserInput {
  const content = typeof input === "string" ? input : input.content;
  return metadata === undefined ? { content } : { content, metadata: clone(metadata) };
}

function materializeHistorySeed(agentId: AgentId, source: HistorySeed): readonly Message[] {
  const seedRunId = createId("seed") as RunId;
  const toolIds = new Map<ToolCallId, ToolCallId>();
  return source.map((message, sequenceWithinRun) => {
    if (message.role === "interaction") {
      return {
        ...clone(message),
        id: createId("msg") as MessageId,
        agentId,
        runId: seedRunId,
        sequenceWithinRun,
        createdAt: createTimestamp(),
      } as Message;
    }
    const content = remapSeedContent(message.content, toolIds);
    return {
      ...clone(message),
      id: createId("msg") as MessageId,
      agentId,
      runId: seedRunId,
      content,
      messageRevision: message.messageRevision ?? 0,
      sequenceWithinRun,
      createdAt: createTimestamp(),
    } as Message;
  });
}

function remapSeedContent(content: import("../runtime-events").MessageContent, toolIds: Map<ToolCallId, ToolCallId>): import("../runtime-events").MessageContent {
  if (typeof content === "string") return content;
  return content.map((part) => {
    if (part.type === "tool_use" || part.type === "tool_result") {
      const toolCallId = toolIds.get(part.toolCallId) ?? (createId("tool") as ToolCallId);
      toolIds.set(part.toolCallId, toolCallId);
      return part.type === "tool_result"
        ? { ...part, toolCallId, result: clone(part.result) }
        : { ...part, toolCallId };
    }
    return clone(part);
  }) as import("../runtime-events").MessageContent;
}

function digestToolEffects(toolCalls: readonly StoredToolCall[]): string {
  return createHash("sha256")
    .update(canonicalJson(toolCalls as never))
    .digest("hex");
}

function assertToolValue(value: import("../runtime-events").JsonValue, argument: string): void {
  assertUtf8ByteLimit(canonicalJson(value), TOOL_VALUE_JSON_BYTES, argument);
}

/**
 * The committed assistant request: the model response's blocks in the order it
 * emitted them, with every reserved Tool Call carrying its durable identity.
 */
function requestMessageContent(
  toolCalls: readonly StoredToolCall[],
  contentBlocks: readonly ContentBlock[] | undefined,
): Exclude<AssistantContent, string>[number][] {
  const toolUse = (toolCall: StoredToolCall) => ({
    type: "tool_use" as const,
    toolCallId: toolCall.id,
    providerToolCallId: toolCall.providerToolCallId,
    name: toolCall.name,
    input: clone(toolCall.args),
  });
  if (!contentBlocks) return toolCalls.map(toolUse);
  const reserved = new Map(toolCalls.map((toolCall) => [toolCall.providerToolCallId, toolCall]));
  const parts: Exclude<AssistantContent, string>[number][] = [];
  for (const block of contentBlocks) {
    if (block.type === "text") {
      parts.push({ type: "text", text: block.text });
    } else if (block.type === "thinking") {
      parts.push({ type: "thinking", thinking: block.thinking, ...(block.signature ? { signature: block.signature } : {}) });
    } else {
      const toolCall = reserved.get(block.id);
      if (!toolCall) continue;
      reserved.delete(block.id);
      parts.push(toolUse(toolCall));
    }
  }
  // A provider whose stream carried no block for a reserved call still owes the
  // next request that call.
  for (const toolCall of reserved.values()) parts.push(toolUse(toolCall));
  return parts;
}
