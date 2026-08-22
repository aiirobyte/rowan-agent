import Type from "typebox";
import type {
  ModelConfig,
  ModelRef,
  StreamFn,
  ThinkingLevel,
} from "@rowan-agent/models";
import type {
  AgentId,
  AgentListCursor,
  AssistantContent,
  AssistantMessage,
  ConfigToken,
  DurableRunEvent,
  EventCursor,
  ExecutionId,
  InputRequestId,
  JsonObject,
  JsonValue,
  Message,
  MessageDelta,
  MessageId,
  MessageRevised,
  Metadata,
  OwnerToken,
  Outcome,
  RunFailure,
  RunId,
  RunEvent,
  RunListCursor,
  RunState,
  QueuedRunFailure,
  ToolCallId,
  ToolCallSnapshot,
  ToolProgress,
  ToolExecutionResult,
  UserContent,
  UserMessage,
} from "../runtime-events";
import type { Skill } from "../protocol";
import type { PhaseRegistry } from "../harness/phases/types";
import type { PhaseInteraction } from "../harness/phases/interactions";
import type { AgentDefinition } from "../harness/definitions";
import { assertAgentDefinition } from "../harness/definitions";
import type {
  LoadInput,
  LoadResult,
} from "./resource-registry";
import type { RuntimeBootstrapRegistry } from "./extension-lifetime";
import type { AgentConfiguration } from "./configuration-snapshot";
import { assertJsonValue, assertUtf8ByteLimit, canonicalJson, isJsonValue } from "./json";

export type {
  AgentId,
  AgentListCursor,
  AssistantContent,
  AssistantMessage,
  ConfigToken,
  DurableEventBase,
  DurableRunEvent,
  DurableToolResult,
  EventCursor,
  EventId,
  ExecutionId,
  ImageContent,
  InputRequestId,
  JsonObject,
  JsonPrimitive,
  JsonValue,
  Message,
  MessageDelta,
  MessageBase,
  MessageCommitted,
  MessageContent,
  MessageId,
  MessageRevised,
  Metadata,
  OpaqueId,
  OwnerToken,
  Outcome,
  RunFailure,
  RunId,
  RunEvent,
  RunListCursor,
  RunState,
  RunStateChanged,
  TextContent,
  ThinkingContent,
  ToolCallId,
  ToolCallSnapshot,
  ToolProgress,
  ToolCallState,
  ToolExecutionResult,
  ToolMessage,
  ToolMessageContent,
  ToolResultContent,
  ToolStateChanged,
  ToolUseContent,
  UserContent,
  UserMessage,
} from "../runtime-events";

export type { PhaseInteraction, PhaseInteractionKind, PhaseInteractionState, PhaseInteractionStatus } from "../harness/phases/interactions";

export type UserInput = string | Readonly<{ content: UserContent; metadata?: Metadata }>;
export type HistorySeed = readonly Message[];

const THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const satisfies readonly ThinkingLevel[];

function thinkingLevelFromMetadata(metadata: unknown): ThinkingLevel | undefined {
  const record = isRecord(metadata) ? metadata : undefined;
  const everyield = record?.everyield;
  if (!isRecord(everyield)) return undefined;
  const level = everyield.thinkingLevel;
  return typeof level === "string" && THINKING_LEVELS.includes(level as ThinkingLevel)
    ? level as ThinkingLevel
    : undefined;
}

export function thinkingLevelFromUserInput(input: UserInput): ThinkingLevel | undefined {
  return typeof input === "string" ? undefined : thinkingLevelFromMetadata(input.metadata);
}

export function thinkingLevelFromMessages(
  messages: readonly { role: string; metadata?: unknown }[],
): ThinkingLevel | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") continue;
    const metadata = message.metadata;
    const kind = isRecord(metadata) && typeof metadata.kind === "string"
      ? metadata.kind
      : undefined;
    if (kind === "phase_prompt" || kind === "phase_input") continue;
    return thinkingLevelFromMetadata(metadata);
  }
  return undefined;
}
export type ToolInvocationContext = Readonly<{
  agentId: AgentId;
  runId: RunId;
  /** Opaque JSON metadata captured from the Agent and Run records. Rowan does
   * not interpret host/domain fields. */
  agentMetadata?: Metadata;
  runMetadata?: Metadata;
  toolCallId: ToolCallId;
  reportProgress(progress: JsonValue): void;
}>;
export type Tool = Readonly<{
  name: string;
  description: string;
  parameters: Type.TSchema;
  execute(args: JsonValue, context: ToolInvocationContext, signal: AbortSignal): Promise<ToolExecutionResult>;
}>;
export type ContextCandidate = Readonly<{ name: string; value: JsonValue }>;
export type ProviderToolDefinition = Readonly<{ name: string; description: string; parameters: JsonObject }>;
export type BeforeToolCall = (input: Readonly<{
  tool: Tool;
  args: JsonValue;
  context: ToolInvocationContext;
  signal: AbortSignal;
}>) => Readonly<{ allow: true }> | Readonly<{ allow: false; reason: string }> | Promise<Readonly<{ allow: true }> | Readonly<{ allow: false; reason: string }>>;
export type AfterToolCall = (input: Readonly<{
  tool: Tool;
  result: ToolExecutionResult;
  context: ToolInvocationContext;
  signal: AbortSignal;
}>) => ToolExecutionResult | Promise<ToolExecutionResult>;
export type AgentResources = Readonly<{
  tools: readonly Tool[];
  skills: readonly Skill[];
  phases?: PhaseRegistry;
  contexts?: readonly ContextCandidate[];
  /** Source-qualified snapshot metadata retained for restart/recovery checks. */
  resourceView?: import("./resource-registry").ResourceView;
  resourceRefs?: readonly import("./resource-registry").ResourceRef[];
  resourceRevisions?: Readonly<Record<import("./resource-registry").ResourceKind, readonly string[]>>;
}>;
export type ResolvedAgentContext = Readonly<{
  systemPrompt: string;
  tools: readonly Tool[];
  skills: readonly Skill[];
  phases?: PhaseRegistry;
}>;
export type AgentConfig = Readonly<{
  identity: string;
  definition: AgentDefinition;
  resources: AgentResources;
  cwd?: string;
  maxAttempts?: number;
  beforeToolCall?: BeforeToolCall;
  afterToolCall?: AfterToolCall;
} & ({ model: ModelConfig; stream?: never } | { model: ModelRef; stream: StreamFn })>;
/** Definition-reference request accepted at the public Runtime seam. */
export type AgentConfigRequest = AgentConfig | AgentConfiguration;

export function isAgentConfiguration(
  config: AgentConfigRequest,
): config is AgentConfiguration {
  return !("resources" in config);
}

export type AgentRecord = Readonly<{
  id: AgentId;
  metadata?: Metadata;
  currentConfigToken?: ConfigToken;
  currentConfigIdentity?: string;
  createdAt: string;
  activatedAt?: string;
  updatedAt: string;
}>;
export type AgentDeletionRequest = Readonly<{
  agentId: AgentId;
  expectedRunIds: readonly RunId[];
  confirmation: "conversation-delete-v1";
}>;
export type ExecutionToken = Readonly<{ runId: RunId; ownerEpoch: number; executionId: ExecutionId }>;
export type ExecutionCheckpoint = Readonly<{ codec: string; version: number; data: JsonValue }>;
export type InputRequest = Readonly<{ id: InputRequestId; phase: string; messageId: MessageId; createdAt: string }>;
export type OwnerLease = Readonly<{ ownerId: string; token: OwnerToken; epoch: number; expiresAt: string }>;
export type RunClaim = Readonly<{ run: RunRecord; execution: ExecutionToken; history: readonly Message[] }>;
export type InputRequiredCommit = Readonly<{ run: RunRecord; prompt: AssistantMessage; request: InputRequest; interactions: readonly PhaseInteraction[] }>;
export type ToolCallReservation = Readonly<{
  providerToolCallId: string;
  name: string;
  args: JsonValue;
  toolCallId?: ToolCallId;
}>;
export type ToolCommit = Readonly<{ run: RunRecord; toolCall: ToolCallSnapshot }>;
export type ToolBatchCommit = Readonly<{ run: RunRecord; toolCalls: readonly ToolCallSnapshot[] }>;
export type RunRecord = Readonly<{
  id: RunId;
  agentId: AgentId;
  agentSequence: number;
  readySequence: number;
  revision: number;
  state: RunState;
  input: UserInput;
  initialMessageId?: MessageId;
  invalidatedBy?: Readonly<{ messageId: MessageId; messageRevision: number }>;
  metadata?: Metadata;
  pinnedConfigToken?: ConfigToken;
  checkpoint?: ExecutionCheckpoint;
  openInputRequest?: InputRequest;
  openInteractions?: readonly PhaseInteraction[];
  interactionAnswers?: Readonly<Record<string, JsonValue>>;
  execution?: ExecutionToken;
  outcome?: Outcome;
  failure?: RunFailure;
  cancellationReason?: string;
  createdAt: string;
  updatedAt: string;
}>;
export type MessageRevisionResult = Readonly<{
  message: UserMessage & Readonly<{ messageRevision: number }>;
  replacementRun: RunRecord;
  invalidatedRunIds: readonly RunId[];
  affectedToolCallIds: readonly ToolCallId[];
  effectDigest?: string;
}>;
export type RetentionResult = Readonly<{
  deletedRunIds: readonly RunId[];
  deletedToolCallIds: readonly ToolCallId[];
  deletedEventCount: number;
  retentionFloor: EventCursor;
  skipped?: "active_consumers" | "no_eligible_events";
}>;
export type AgentSummary = Readonly<{ id: AgentId; metadata?: Metadata; currentConfigIdentity?: string; createdAt: string; activatedAt: string; updatedAt: string }>;
export type RunSummary = Readonly<{ id: RunId; agentId: AgentId; agentSequence: number; state: RunState; metadata?: Metadata; createdAt: string; updatedAt: string }>;
export type Page<T, Cursor> = Readonly<{ items: readonly T[]; next?: Cursor }>;
export type RunSnapshotBase = Readonly<{
  runId: RunId;
  agentId: AgentId;
  agentSequence: number;
  revision: number;
  input: UserInput;
  metadata?: Metadata;
  messageCount: number;
  toolCallCount: number;
  createdAt: string;
  updatedAt: string;
  cursor: EventCursor;
}>;
export type RunSnapshot = RunSnapshotBase & (
  | Readonly<{ state: "queued" | "running" }>
  | Readonly<{
      state: "input_required";
      request: Readonly<{ id: InputRequestId; phase: string; prompt: AssistantMessage }>;
      interactions: readonly PhaseInteraction[];
      answers: Readonly<Record<string, JsonValue>>;
    }>
  | Readonly<{ state: "completed"; outcome: Outcome; output?: AssistantMessage }>
  | Readonly<{ state: "failed"; failure: RunFailure }>
  | Readonly<{ state: "cancelled"; reason?: string }>
);
export type RunBoundary =
  | Readonly<{
      type: "input_required";
      requestId: InputRequestId;
      phase: string;
      prompt: AssistantMessage;
      interactions: readonly PhaseInteraction[];
      answers: Readonly<Record<string, JsonValue>>;
    }>
  | Readonly<{ type: "completed"; outcome: Outcome; output?: AssistantMessage }>
  | Readonly<{ type: "failed"; failure: RunFailure }>
  | Readonly<{ type: "cancelled"; reason?: string }>;

export type ConfigResolution = Readonly<
  | { kind: "available"; config: AgentConfigRequest }
  | { kind: "deferred"; retryAfterMs?: number }
  | { kind: "unavailable"; reason: string }
>;
export type ConfigPutResult = Readonly<{ kind: "stored"; token: string } | { kind: "identity_conflict" }>;
export interface ConfigProvider {
  put(input: { agentId: AgentId; agentMetadata?: Metadata; config: AgentConfigRequest; operationId: string; signal: AbortSignal }): Promise<ConfigPutResult>;
  resolve(input: { agentId: AgentId; agentMetadata?: Metadata; token: ConfigToken; signal: AbortSignal }): Promise<ConfigResolution>;
}
export interface OwnedStore {
  readonly lease: OwnerLease;
  reserveAgent(input: { idempotencyKey: string; metadata?: Metadata; configIdentity?: string; historySeed?: HistorySeed }): Promise<AgentRecord>;
  activateAgent(agentId: AgentId, configToken?: ConfigToken, configIdentity?: string): Promise<AgentRecord>;
  updateAgentConfigToken(input: { agentId: AgentId; token: ConfigToken; configIdentity?: string; idempotencyKey: string }): Promise<AgentRecord>;
  deleteAgent(input: AgentDeletionRequest): Promise<void>;
  reviseMessage(input: {
    agentId: AgentId;
    messageId: MessageId;
    expectedMessageRevision: number;
    content: UserContent;
    operationId: string;
    effectDigestConfirmation?: string;
  }): Promise<MessageRevisionResult>;
  compact(input?: { now?: string; retentionMs?: number }): Promise<RetentionResult>;
  createRun(input: { agentId: AgentId; input: UserInput; metadata?: Metadata; idempotencyKey: string }): Promise<RunRecord>;
  claimRun(input: { runId: RunId; expectedRevision: number; executionId?: ExecutionId; messageId?: MessageId; configToken?: ConfigToken }): Promise<RunClaim>;
  failQueuedRun(input: { runId: RunId; expectedRevision: number; failure: QueuedRunFailure }): Promise<RunRecord>;
  commitInputRequired(input: {
    runId: RunId;
    execution: ExecutionToken;
    expectedRevision: number;
    requestId?: InputRequestId;
    phase: string;
    prompt: AssistantMessage;
    checkpoint: ExecutionCheckpoint;
    interactions?: readonly PhaseInteraction[];
    interactionAnswers?: Readonly<Record<string, JsonValue>>;
  }): Promise<InputRequiredCommit>;
  answerInput(input: {
    runId: RunId;
    requestId: InputRequestId;
    expectedRevision: number;
    input: UserInput;
    messageId?: MessageId;
  }): Promise<RunRecord>;
  answerInteraction(input: {
    runId: RunId;
    interactionId: string;
    expectedRevision: number;
    input: JsonValue;
  }): Promise<RunRecord>;
  commitOutcome(input: {
    runId: RunId;
    execution: ExecutionToken;
    expectedRevision: number;
    outcome?: Outcome;
    failure?: RunFailure;
    output?: AssistantMessage;
  }): Promise<RunRecord>;
  reserveToolCall(input: {
    runId: RunId;
    execution: ExecutionToken;
    expectedRevision: number;
    requestMessageId: MessageId;
    name: string;
    args: JsonValue;
    toolCallId?: ToolCallId;
    providerToolCallId?: string;
  }): Promise<ToolCommit>;
  reserveToolCalls(input: {
    runId: RunId;
    execution: ExecutionToken;
    expectedRevision: number;
    requestMessageId: MessageId;
    calls: readonly ToolCallReservation[];
  }): Promise<ToolBatchCommit>;
  startToolCall(input: {
    runId: RunId;
    execution: ExecutionToken;
    expectedRevision: number;
    toolCallId: ToolCallId;
  }): Promise<ToolCommit>;
  commitToolResult(input: {
    runId: RunId;
    execution: ExecutionToken;
    expectedRevision: number;
    toolCallId: ToolCallId;
    result: ToolExecutionResult;
    state: "completed" | "failed" | "indeterminate";
    reason?: string;
  }): Promise<ToolCommit>;
  cancelRun(input: { runId: RunId; expectedRevision?: number; reason?: string; output?: AssistantMessage }): Promise<RunRecord>;
  snapshotRun(runId: RunId): Promise<RunSnapshot>;
  history(agentId: AgentId): Promise<readonly Message[]>;
  listAgents(): Promise<readonly AgentRecord[]>;
  listRuns(input?: { agentId?: AgentId; states?: readonly RunState[] }): Promise<readonly RunRecord[]>;
  listEvents(input?: { after?: EventCursor }): Promise<readonly DurableRunEvent[]>;
  openConsumer(consumerId: string): Promise<ConsumerRegistration>;
  advanceConsumerCheckpoint(input: { consumerId: string; cursor: EventCursor }): Promise<void>;
  renewOwner(leaseMs: number): Promise<OwnerLease>;
  sealAndReleaseOwner(): Promise<void>;
}
export interface DurableStore { openOwner(input: { ownerId: string; leaseMs: number }): Promise<OwnedStore> }
export type AgentRuntimeOptions = Readonly<{
  store: DurableStore;
  configs?: ConfigProvider;
  concurrency?: number;
  bootstrap?: (registry: RuntimeBootstrapRegistry) => void | Promise<void>;
}>;
export type DurableConsumer = Readonly<{ caughtUp: Promise<void>; done: Promise<void>; stop(): void }>;
export interface AgentRun {
  readonly id: RunId;
  snapshot(): Promise<RunSnapshot>;
  observe(options?: { after?: EventCursor; signal?: AbortSignal }): AsyncIterable<RunEvent>;
  wait(options?: { signal?: AbortSignal }): Promise<RunBoundary>;
  respond(input: { requestId: InputRequestId; input: UserInput }): Promise<void>;
  respondInteraction(input: { interactionId: string; input: JsonValue }): Promise<void>;
  cancel(reason?: string): Promise<RunBoundary>;
}
export interface AgentRuntime {
  loadAgents(input: LoadInput<AgentDefinition>): Promise<LoadResult>;
  loadSkills(input: LoadInput<Skill>): Promise<LoadResult>;
  loadPhases(input: LoadInput<import("../harness/phases/types").Phase>): Promise<LoadResult>;
  loadTools(input: Readonly<{ sourceId: string; values: readonly Tool[] }>): Promise<LoadResult>;
  unload(input: Readonly<{ kind: import("./resource-registry").ResourceKind; sourceId: string }>): Promise<LoadResult>;
  createAgent(config: AgentConfigRequest, options?: { idempotencyKey?: string; metadata?: Metadata; historySeed?: HistorySeed }): Promise<AgentId>;
  updateAgentConfig(agentId: AgentId, config: AgentConfigRequest, options: { idempotencyKey: string }): Promise<void>;
  deleteAgent(input: AgentDeletionRequest): Promise<void>;
  revise(agentId: AgentId, input: {
    messageId: MessageId;
    expectedMessageRevision: number;
    content: UserContent;
    operationId: string;
    effectDigestConfirmation?: string;
  }): Promise<MessageRevisionResult>;
  compact(input?: { now?: string; retentionMs?: number }): Promise<RetentionResult>;
  start(agentId: AgentId, input: UserInput, options: { idempotencyKey: string; metadata?: Metadata }): Promise<AgentRun>;
  run(runId: RunId): AgentRun;
  history(agentId: AgentId): Promise<readonly Message[]>;
  listAgents(input?: { after?: AgentListCursor; limit?: number }): Promise<Page<AgentSummary, AgentListCursor>>;
  listRuns(input?: { agentId?: AgentId; states?: readonly RunState[]; after?: RunListCursor; limit?: number }): Promise<Page<RunSummary, RunListCursor>>;
  consume(input: { consumerId: string; signal: AbortSignal; onEvent(event: DurableRunEvent, context: Readonly<{ signal: AbortSignal }>): void | Promise<void> }): Promise<DurableConsumer>;
  close(): Promise<void>;
}
export type ConsumerRegistration = Readonly<{ cursor?: EventCursor; waterline: EventCursor }>;

const METADATA_LIMIT = 64 * 1024;
const IDENTITY_LIMIT = 256;
function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function hasOnlyKeys(value: object, allowed: readonly string[]): boolean {
  return Reflect.ownKeys(value).every((key) => typeof key === "string" && allowed.includes(key));
}
function isMetadata(value: unknown): value is Metadata {
  if (!isRecord(value) || !isJsonValue(value)) return false;
  try {
    assertUtf8ByteLimit(canonicalJson(value), METADATA_LIMIT, "metadata");
    return true;
  } catch {
    return false;
  }
}
function assertMetadata(value: unknown, argument: string): asserts value is Metadata {
  if (!isMetadata(value)) throw new TypeError(`${argument} must be a JSON-safe metadata object`);
}
function isText(value: unknown): boolean { return isRecord(value) && value.type === "text" && typeof value.text === "string"; }
function isImage(value: unknown): boolean { return isRecord(value) && value.type === "image" && typeof value.data === "string" && typeof value.mimeType === "string"; }
function isUserContent(value: unknown): value is UserContent { return typeof value === "string" || (Array.isArray(value) && value.every((part) => isText(part) || isImage(part))); }
function isAssistantContent(value: unknown): value is AssistantContent {
  return typeof value === "string" || (Array.isArray(value) && value.every((part) => {
    if (isText(part)) return true;
    if (!isRecord(part)) return false;
    if (part.type === "thinking") return typeof part.thinking === "string" && (part.signature === undefined || typeof part.signature === "string");
    return part.type === "tool_use" && typeof part.toolCallId === "string" && typeof part.name === "string" && isJsonValue(part.input);
  }));
}
export function normalizeUserInput(input: UserInput): UserInput {
  const normalized = typeof input === "string" ? { content: input } : input;
  if (!isRecord(normalized) || !hasOnlyKeys(normalized, ["content", "metadata"]) || !isUserContent(normalized.content)) throw new TypeError("input must contain only valid UserContent");
  if (normalized.metadata !== undefined) assertMetadata(normalized.metadata, "input.metadata");
  assertJsonValue(normalized, "input");
  return normalized;
}
export function canonicalUserInput(input: UserInput): string { return canonicalJson(normalizeUserInput(input) as never); }
export function isAssistantMessage(value: unknown): value is AssistantMessage {
  return isRecord(value) && hasOnlyKeys(value, ["id", "agentId", "runId", "messageRevision", "role", "content", "metadata", "sequenceWithinRun", "createdAt", "interrupted"])
    && typeof value.id === "string" && typeof value.agentId === "string" && typeof value.runId === "string" && value.role === "assistant"
    && (value.messageRevision === undefined || (Number.isInteger(value.messageRevision) && (value.messageRevision as number) >= 0))
    && Number.isInteger(value.sequenceWithinRun) && (value.sequenceWithinRun as number) >= 0 && typeof value.createdAt === "string"
    && isAssistantContent(value.content) && (value.metadata === undefined || isMetadata(value.metadata))
    && (value.interrupted === undefined || typeof value.interrupted === "boolean");
}
function isToolResult(value: unknown): value is ToolExecutionResult {
  if (!isRecord(value) || !isJsonValue(value.content) || typeof value.ok !== "boolean") return false;
  const expected = value.ok ? ["content", "ok"] : ["content", "error", "ok"];
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(expected)) return false;
  return value.ok || typeof value.error === "string";
}
function isDurableToolResult(value: unknown): boolean {
  if (!isRecord(value) || typeof value.toolCallId !== "string" || typeof value.toolName !== "string") return false;
  const result = { ...value };
  delete result.toolCallId;
  delete result.toolName;
  return isToolResult(result);
}
function isOutcome(value: unknown): value is Outcome {
  return isRecord(value) && hasOnlyKeys(value, ["id", "message", "payload", "toolResults"])
    && typeof value.id === "string" && typeof value.message === "string"
    && (value.payload === undefined || isJsonValue(value.payload))
    && (value.toolResults === undefined || (Array.isArray(value.toolResults) && value.toolResults.every(isDurableToolResult)));
}
export function isRunFailure(value: unknown): value is RunFailure {
  if (!isRecord(value) || typeof value.code !== "string" || typeof value.message !== "string") return false;
  switch (value.code) {
    case "configuration_unavailable": return hasOnlyKeys(value, ["code", "message"]);
    case "checkpoint_incompatible": return hasOnlyKeys(value, ["code", "message", "expected", "actual"])
      && isRecord(value.expected) && typeof value.expected.codec === "string" && Array.isArray(value.expected.versions) && value.expected.versions.every((v) => Number.isInteger(v))
      && isRecord(value.actual) && typeof value.actual.codec === "string" && Number.isInteger(value.actual.version);
    case "runtime_interrupted": return hasOnlyKeys(value, ["code", "message", "ownerEpoch"]) && Number.isInteger(value.ownerEpoch) && (value.ownerEpoch as number) >= 0;
    case "tool_indeterminate": return hasOnlyKeys(value, ["code", "message", "toolCallIds"]) && Array.isArray(value.toolCallIds) && value.toolCallIds.length > 0 && value.toolCallIds.every((id) => typeof id === "string");
    case "execution_failed": return hasOnlyKeys(value, ["code", "message", "details"]) && (value.details === undefined || isJsonValue(value.details));
    default: return false;
  }
}
function assertAssistantReference(message: unknown, agentId: string, runId: string, committedMessages: readonly Message[] | undefined, argument: string): asserts message is AssistantMessage {
  if (!isAssistantMessage(message) || message.agentId !== agentId || message.runId !== runId) throw new TypeError(`${argument} must be an AssistantMessage from this Run`);
  if (!committedMessages) throw new TypeError(`${argument} must reference committed history`);
  const committed = committedMessages.find((candidate) => candidate.id === message.id);
  if (!committed || !isAssistantMessage(committed) || committed.agentId !== agentId || committed.runId !== runId) throw new TypeError(`${argument} must reference a committed AssistantMessage`);
}
export function assertValidRunSnapshot(value: unknown, options: { committedMessages?: readonly Message[] } = {}): asserts value is RunSnapshot {
  if (!isRecord(value) || typeof value.runId !== "string" || typeof value.agentId !== "string" || !Number.isInteger(value.agentSequence) || (value.agentSequence as number) < 0 || !Number.isInteger(value.revision) || (value.revision as number) < 0 || typeof value.createdAt !== "string" || typeof value.updatedAt !== "string" || typeof value.cursor !== "string" || !Number.isInteger(value.messageCount) || !Number.isInteger(value.toolCallCount) || (value.messageCount as number) < 0 || (value.toolCallCount as number) < 0) throw new TypeError("Invalid Run snapshot base");
  normalizeUserInput(value.input as UserInput);
  if (value.metadata !== undefined) assertMetadata(value.metadata, "snapshot.metadata");
  switch (value.state) {
    case "queued":
    case "running":
      if (["request", "outcome", "output", "failure", "reason"].some((key) => key in value)) throw new TypeError("Snapshot contains incompatible state data");
      return;
    case "input_required":
      if (!isRecord(value.request) || !hasOnlyKeys(value.request, ["id", "phase", "prompt"]) || typeof value.request.id !== "string" || typeof value.request.phase !== "string" || value.request.phase.length === 0) throw new TypeError("Invalid Input Request snapshot");
      assertAssistantReference(value.request.prompt, value.agentId, value.runId, options.committedMessages, "request.prompt");
      if (["outcome", "output", "failure", "reason"].some((key) => key in value)) throw new TypeError("Input-required snapshot contains terminal data");
      return;
    case "completed":
      if (!isOutcome(value.outcome)) throw new TypeError("Invalid completed outcome");
      if (value.output !== undefined) assertAssistantReference(value.output, value.agentId, value.runId, options.committedMessages, "output");
      if (["request", "failure", "reason"].some((key) => key in value)) throw new TypeError("Completed snapshot contains incompatible data");
      return;
    case "failed":
      if (!isRunFailure(value.failure) || ["request", "outcome", "output", "reason"].some((key) => key in value)) throw new TypeError("Invalid failed snapshot");
      return;
    case "cancelled":
      if ((value.reason !== undefined && typeof value.reason !== "string") || ["request", "outcome", "output", "failure"].some((key) => key in value)) throw new TypeError("Invalid cancelled snapshot");
      return;
    default:
      throw new TypeError("Invalid Run state");
  }
}
export function assertAgentConfig(config: AgentConfig): void {
  if (typeof config.identity !== "string" || config.identity.length === 0) throw new TypeError("config.identity must be non-empty");
  assertUtf8ByteLimit(config.identity, IDENTITY_LIMIT, "config.identity");
  assertAgentDefinition(config.definition);
  if (!config.resources || !Array.isArray(config.resources.tools) || !Array.isArray(config.resources.skills)) {
    throw new TypeError("config.resources is invalid");
  }
  for (const tool of config.resources.tools) projectToolDefinition(tool);
  const names = new Set<string>();
  for (const context of config.resources.contexts ?? []) {
    if (typeof context.name !== "string" || context.name.trim() === "") {
      throw new TypeError("Context candidate name must be non-empty");
    }
    if (names.has(context.name)) throw new TypeError(`Duplicate Context candidate "${context.name}".`);
    names.add(context.name);
    assertJsonValue(context.value, `Context candidate "${context.name}" value`);
  }
}
export function assertAgentConfigRequest(config: AgentConfigRequest): void {
  if (!isAgentConfiguration(config)) {
    assertAgentConfig(config);
    return;
  }
  if (typeof config.identity !== "string" || config.identity.length === 0) throw new TypeError("config.identity must be non-empty");
  assertUtf8ByteLimit(config.identity, IDENTITY_LIMIT, "config.identity");
  if (!config.definition || typeof config.definition.name !== "string" || config.definition.name.trim() === "") {
    throw new TypeError("config.definition.name must be non-empty");
  }
  if (config.definition.layer && "content" in config.definition.layer) {
    throw new TypeError("definition.layer.content is not supported; use definition.layer.prompt");
  }
  const view = config.resourceView;
  if (!view || !Array.isArray(view.agents) || !Array.isArray(view.tools) || !Array.isArray(view.skills) || !Array.isArray(view.phases)) {
    throw new TypeError("config.resourceView is invalid");
  }
  for (const [kind, ids] of Object.entries(view)) {
    for (const sourceId of ids as readonly unknown[]) {
      if (typeof sourceId !== "string" || sourceId.trim() === "") throw new TypeError(`config.resourceView.${kind} contains an invalid Source ID`);
    }
  }
  for (const context of config.contexts ?? []) {
    if (typeof context.name !== "string" || context.name.trim() === "") throw new TypeError("Context candidate name must be non-empty");
    assertJsonValue(context.value, `Context candidate "${context.name}" value`);
  }
}
export function assertToolExecutionResult(value: unknown): asserts value is ToolExecutionResult {
  if (!isToolResult(value)) throw new TypeError("Tool result must be JSON-safe and contain no Runtime identity");
}
export function projectToolDefinition(tool: Tool): ProviderToolDefinition {
  if (typeof tool.name !== "string" || tool.name.length === 0 || typeof tool.description !== "string") throw new TypeError("Tool definition is invalid");
  assertJsonValue(tool.parameters, "tool.parameters");
  if (!isRecord(tool.parameters)) throw new TypeError("tool.parameters must be a JSON object");
  return { name: tool.name, description: tool.description, parameters: JSON.parse(canonicalJson(tool.parameters)) as JsonObject };
}
