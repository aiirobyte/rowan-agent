import Type from "typebox";
import type { ModelConfig, ModelRef, StreamFn } from "@rowan-agent/models";
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
} from "../runtime-events";
import type { Skill } from "../protocol";
import type { PhaseRegistry } from "../harness/phases/types";
import type { LoadedExtension } from "../extensions/types";
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
  Metadata,
  OpaqueId,
  OwnerToken,
  Outcome,
  RunFailure,
  RunId,
  RunEvent,
  RunListCursor,
  RunState,
  RunTransitioned,
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

export type UserInput = string | Readonly<{ content: UserContent; metadata?: Metadata }>;
export type ToolInvocationContext = Readonly<{
  agentId: AgentId;
  runId: RunId;
  toolCallId: ToolCallId;
  reportProgress(progress: JsonValue): void;
}>;
export type Tool = Readonly<{
  name: string;
  description: string;
  parameters: Type.TSchema;
  execute(args: JsonValue, context: ToolInvocationContext, signal: AbortSignal): Promise<ToolExecutionResult>;
}>;
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
export type AgentDefinitionContext = Readonly<{ systemPrompt: string; tools: readonly Tool[]; skills: readonly Skill[]; phases?: PhaseRegistry }>;
export type AgentConfig = Readonly<{
  identity: string;
  context: AgentDefinitionContext;
  cwd?: string;
  extensions?: readonly LoadedExtension[];
  maxAttempts?: number;
  beforeToolCall?: BeforeToolCall;
  afterToolCall?: AfterToolCall;
} & ({ model: ModelConfig; stream?: never } | { model: ModelRef; stream: StreamFn })>;

export type AgentRecord = Readonly<{
  id: AgentId;
  metadata?: Metadata;
  currentConfigToken?: ConfigToken;
  currentConfigIdentity?: string;
  createdAt: string;
  activatedAt?: string;
  updatedAt: string;
}>;
export type ExecutionToken = Readonly<{ runId: RunId; ownerEpoch: number; executionId: ExecutionId }>;
export type ExecutionCheckpoint = Readonly<{ codec: string; version: number; data: JsonValue }>;
export type InputRequest = Readonly<{ id: InputRequestId; messageId: MessageId; createdAt: string }>;
export type OwnerLease = Readonly<{ ownerId: string; token: OwnerToken; epoch: number; expiresAt: string }>;
export type RunClaim = Readonly<{ run: RunRecord; execution: ExecutionToken; history: readonly Message[] }>;
export type InputRequiredCommit = Readonly<{ run: RunRecord; prompt: AssistantMessage; request: InputRequest }>;
export type ToolCommit = Readonly<{ run: RunRecord; toolCall: ToolCallSnapshot }>;
export type RunRecord = Readonly<{
  id: RunId;
  agentId: AgentId;
  agentSequence: number;
  readySequence: number;
  revision: number;
  state: RunState;
  input: UserInput;
  metadata?: Metadata;
  pinnedConfigToken?: ConfigToken;
  checkpoint?: ExecutionCheckpoint;
  openInputRequest?: InputRequest;
  execution?: ExecutionToken;
  outcome?: Outcome;
  failure?: RunFailure;
  cancellationReason?: string;
  createdAt: string;
  updatedAt: string;
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
  | Readonly<{ state: "input_required"; request: Readonly<{ id: InputRequestId; prompt: AssistantMessage }> }>
  | Readonly<{ state: "completed"; outcome: Outcome; output?: AssistantMessage }>
  | Readonly<{ state: "failed"; failure: RunFailure }>
  | Readonly<{ state: "cancelled"; reason?: string }>
);
export type RunBoundary =
  | Readonly<{ type: "input_required"; requestId: InputRequestId; prompt: AssistantMessage }>
  | Readonly<{ type: "completed"; outcome: Outcome; output?: AssistantMessage }>
  | Readonly<{ type: "failed"; failure: RunFailure }>
  | Readonly<{ type: "cancelled"; reason?: string }>;

export type ConfigResolution = Readonly<
  | { kind: "available"; config: AgentConfig }
  | { kind: "deferred"; retryAfterMs?: number }
  | { kind: "unavailable"; reason: string }
>;
export type ConfigPutResult = Readonly<{ kind: "stored"; token: string } | { kind: "identity_conflict" }>;
export interface ConfigProvider {
  put(input: { agentId: AgentId; agentMetadata?: Metadata; config: AgentConfig; operationId: string; signal: AbortSignal }): Promise<ConfigPutResult>;
  resolve(input: { agentId: AgentId; agentMetadata?: Metadata; token: ConfigToken; signal: AbortSignal }): Promise<ConfigResolution>;
}
export interface OwnedStore {
  readonly lease: OwnerLease;
  reserveAgent(input: { idempotencyKey: string; metadata?: Metadata; configIdentity?: string }): Promise<AgentRecord>;
  activateAgent(agentId: AgentId, configToken?: ConfigToken, configIdentity?: string): Promise<AgentRecord>;
  updateAgentConfigToken(input: { agentId: AgentId; token: ConfigToken; configIdentity?: string; idempotencyKey: string }): Promise<AgentRecord>;
  createRun(input: { agentId: AgentId; input: UserInput; metadata?: Metadata; idempotencyKey: string }): Promise<RunRecord>;
  claimRun(input: { runId: RunId; expectedRevision: number; executionId?: ExecutionId; messageId?: MessageId; configToken?: ConfigToken }): Promise<RunClaim>;
  failQueuedRun(input: { runId: RunId; expectedRevision: number; failure: QueuedRunFailure }): Promise<RunRecord>;
  commitInputRequired(input: {
    runId: RunId;
    execution: ExecutionToken;
    expectedRevision: number;
    requestId?: InputRequestId;
    prompt: AssistantMessage;
    checkpoint: ExecutionCheckpoint;
  }): Promise<InputRequiredCommit>;
  answerInput(input: {
    runId: RunId;
    requestId: InputRequestId;
    expectedRevision: number;
    input: UserInput;
    messageId?: MessageId;
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
  }): Promise<ToolCommit>;
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
  cancelRun(input: { runId: RunId; expectedRevision?: number; reason?: string }): Promise<RunRecord>;
  snapshotRun(runId: RunId): Promise<RunSnapshot>;
  listAgents(): Promise<readonly AgentRecord[]>;
  listRuns(input?: { agentId?: AgentId; states?: readonly RunState[] }): Promise<readonly RunRecord[]>;
  listEvents(input?: { after?: EventCursor }): Promise<readonly DurableRunEvent[]>;
  openConsumer(consumerId: string): Promise<ConsumerRegistration>;
  advanceConsumerCheckpoint(input: { consumerId: string; cursor: EventCursor }): Promise<void>;
  renewOwner(leaseMs: number): Promise<OwnerLease>;
  sealAndReleaseOwner(): Promise<void>;
}
export interface DurableStore { openOwner(input: { ownerId: string; leaseMs: number }): Promise<OwnedStore> }
export type AgentRuntimeOptions = Readonly<{ store: DurableStore; configs?: ConfigProvider; concurrency?: number }>;
export type DurableConsumer = Readonly<{ caughtUp: Promise<void>; done: Promise<void>; stop(): void }>;
export interface AgentRun {
  readonly id: RunId;
  snapshot(): Promise<RunSnapshot>;
  observe(options?: { after?: EventCursor; signal?: AbortSignal }): AsyncIterable<RunEvent>;
  wait(options?: { signal?: AbortSignal }): Promise<RunBoundary>;
  respond(input: { requestId: InputRequestId; input: UserInput }): Promise<void>;
  cancel(reason?: string): Promise<RunBoundary>;
}
export interface AgentRuntime {
  createAgent(config: AgentConfig, options?: { idempotencyKey?: string; metadata?: Metadata }): Promise<AgentId>;
  updateAgentConfig(agentId: AgentId, config: AgentConfig, options: { idempotencyKey: string }): Promise<void>;
  start(agentId: AgentId, input: UserInput, options: { idempotencyKey: string; metadata?: Metadata }): Promise<AgentRun>;
  run(runId: RunId): AgentRun;
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
  return isRecord(value) && hasOnlyKeys(value, ["id", "agentId", "runId", "role", "content", "metadata", "sequenceWithinRun", "createdAt"])
    && typeof value.id === "string" && typeof value.agentId === "string" && typeof value.runId === "string" && value.role === "assistant"
    && Number.isInteger(value.sequenceWithinRun) && (value.sequenceWithinRun as number) >= 0 && typeof value.createdAt === "string"
    && isAssistantContent(value.content) && (value.metadata === undefined || isMetadata(value.metadata));
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
      if (!isRecord(value.request) || !hasOnlyKeys(value.request, ["id", "prompt"]) || typeof value.request.id !== "string") throw new TypeError("Invalid Input Request snapshot");
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
  if (!config.context || typeof config.context.systemPrompt !== "string") throw new TypeError("config.context is invalid");
  for (const tool of config.context.tools) projectToolDefinition(tool);
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
