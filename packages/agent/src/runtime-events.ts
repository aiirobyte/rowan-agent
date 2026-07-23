/** Durable and transient DTOs owned by the event-driven Agent Runtime. */

declare const opaqueIdBrand: unique symbol;

export type OpaqueId<Kind extends string> = string & {
  readonly [opaqueIdBrand]: Kind;
};

export type AgentId = OpaqueId<"AgentId">;
export type RunId = OpaqueId<"RunId">;
export type MessageId = OpaqueId<"MessageId">;
export type InputRequestId = OpaqueId<"InputRequestId">;
export type ToolCallId = OpaqueId<"ToolCallId">;
export type EventId = OpaqueId<"EventId">;
export type ExecutionId = OpaqueId<"ExecutionId">;
export type OutcomeId = OpaqueId<"OutcomeId">;
export type ConfigToken = OpaqueId<"ConfigToken">;
export type OwnerToken = OpaqueId<"OwnerToken">;
export type EventCursor = OpaqueId<"EventCursor">;
export type AgentListCursor = OpaqueId<"AgentListCursor">;
export type RunListCursor = OpaqueId<"RunListCursor">;

export type JsonPrimitive = null | boolean | number | string;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };
export type JsonObject = Readonly<Record<string, JsonValue>>;
export type Metadata = JsonObject;

export type TextContent = Readonly<{ type: "text"; text: string }>;
export type ImageContent = Readonly<{ type: "image"; data: string; mimeType: string }>;
export type ThinkingContent = Readonly<{ type: "thinking"; thinking: string; signature?: string }>;
export type ToolUseContent = Readonly<{
  type: "tool_use";
  toolCallId: ToolCallId;
  name: string;
  input: JsonValue;
}>;

export type ToolExecutionResult =
  | Readonly<{ ok: true; content: JsonValue }>
  | Readonly<{ ok: false; content: JsonValue; error: string }>;

export type DurableToolResult = Readonly<{
  toolCallId: ToolCallId;
  toolName: string;
}> & ToolExecutionResult;

export type ToolResultContent = Readonly<{
  type: "tool_result";
  toolCallId: ToolCallId;
  result: ToolExecutionResult;
}>;

export type UserContent = string | readonly (TextContent | ImageContent)[];
export type AssistantContent = string | readonly (TextContent | ThinkingContent | ToolUseContent)[];
export type ToolMessageContent = readonly [ToolResultContent, ...ToolResultContent[]];
export type MessageContent = UserContent | AssistantContent | ToolMessageContent;

export type MessageBase = Readonly<{
  id: MessageId;
  agentId: AgentId;
  runId: RunId;
  metadata?: Metadata;
  sequenceWithinRun: number;
  createdAt: string;
}>;

export type UserMessage = MessageBase & Readonly<{ role: "user"; content: UserContent }>;
export type AssistantMessage = MessageBase & Readonly<{ role: "assistant"; content: AssistantContent }>;
export type ToolMessage = MessageBase & Readonly<{ role: "tool"; content: ToolMessageContent }>;
export type Message = UserMessage | AssistantMessage | ToolMessage;

export type Outcome = Readonly<{
  id: OutcomeId;
  message: string;
  payload?: JsonValue;
  toolResults?: readonly DurableToolResult[];
}>;

export type RunState =
  | "queued"
  | "running"
  | "input_required"
  | "completed"
  | "failed"
  | "cancelled";

export type RunFailure =
  | Readonly<{ code: "configuration_unavailable"; message: string }>
  | Readonly<{
      code: "checkpoint_incompatible";
      message: string;
      expected: Readonly<{ codec: string; versions: readonly number[] }>;
      actual: Readonly<{ codec: string; version: number }>;
    }>
  | Readonly<{ code: "runtime_interrupted"; message: string; ownerEpoch: number }>
  | Readonly<{
      code: "tool_indeterminate";
      message: string;
      toolCallIds: readonly [ToolCallId, ...ToolCallId[]];
    }>
  | Readonly<{ code: "execution_failed"; message: string; details?: JsonValue }>;

export type QueuedRunFailure = Extract<
  RunFailure,
  { code: "configuration_unavailable" | "checkpoint_incompatible" }
>;
export type RunningRunFailure = Extract<
  RunFailure,
  { code: "runtime_interrupted" | "tool_indeterminate" | "execution_failed" }
>;

export type ToolCallState = "pending" | "running" | "completed" | "failed" | "indeterminate";
export type ToolCallSnapshotBase = Readonly<{
  id: ToolCallId;
  agentId: AgentId;
  runId: RunId;
  executionId: ExecutionId;
  requestMessageId: MessageId;
  name: string;
  args: JsonValue;
  createdAt: string;
  updatedAt: string;
}>;

export type ToolCallSnapshot = ToolCallSnapshotBase & (
  | Readonly<{ state: "pending" }>
  | Readonly<{ state: "running" }>
  | Readonly<{
      state: "completed";
      result: DurableToolResult & Readonly<{ ok: true }>;
      resultMessageId: MessageId;
    }>
  | Readonly<{
      state: "failed";
      result: DurableToolResult & Readonly<{ ok: false }>;
      resultMessageId: MessageId;
    }>
  | Readonly<{
      state: "indeterminate";
      result: DurableToolResult & Readonly<{ ok: false }>;
      resultMessageId: MessageId;
      reason: string;
    }>
);

export type DurableEventBase = Readonly<{
  id: EventId;
  schemaVersion: 1;
  cursor: EventCursor;
  durability: "durable";
  agentId: AgentId;
  runId: RunId;
  runRevision: number;
  metadata?: Metadata;
  createdAt: string;
}>;

export type MessageCommitted = DurableEventBase & Readonly<{
  kind: "message_committed";
  message: Message;
}>;

export type RunTransitioned = DurableEventBase & (
  | Readonly<{ kind: "run_transitioned"; from: null; to: "queued" }>
  | Readonly<{ kind: "run_transitioned"; from: "input_required"; to: "queued" }>
  | Readonly<{ kind: "run_transitioned"; from: "queued"; to: "running" }>
  | Readonly<{
      kind: "run_transitioned";
      from: "running";
      to: "input_required";
      request: Readonly<{ id: InputRequestId; prompt: AssistantMessage }>;
    }>
  | Readonly<{
      kind: "run_transitioned";
      from: "running";
      to: "completed";
      outcome: Outcome;
      output?: AssistantMessage;
    }>
  | Readonly<{ kind: "run_transitioned"; from: "queued"; to: "failed"; failure: QueuedRunFailure }>
  | Readonly<{ kind: "run_transitioned"; from: "running"; to: "failed"; failure: RunningRunFailure }>
  | Readonly<{
      kind: "run_transitioned";
      from: "queued" | "running" | "input_required";
      to: "cancelled";
      reason?: string;
    }>
);

export type ToolStateChanged = DurableEventBase & (
  | Readonly<{
      kind: "tool_state_changed";
      transition: Readonly<{ from: null; to: "pending" }>;
      toolCall: Extract<ToolCallSnapshot, { state: "pending" }>;
    }>
  | Readonly<{
      kind: "tool_state_changed";
      transition: Readonly<{ from: "pending"; to: "running" }>;
      toolCall: Extract<ToolCallSnapshot, { state: "running" }>;
    }>
  | Readonly<{
      kind: "tool_state_changed";
      transition: Readonly<{ from: "pending"; to: "failed" }>;
      toolCall: Extract<ToolCallSnapshot, { state: "failed" }>;
    }>
  | Readonly<{
      kind: "tool_state_changed";
      transition: Readonly<{ from: "running"; to: "completed" }>;
      toolCall: Extract<ToolCallSnapshot, { state: "completed" }>;
    }>
  | Readonly<{
      kind: "tool_state_changed";
      transition: Readonly<{ from: "running"; to: "failed" }>;
      toolCall: Extract<ToolCallSnapshot, { state: "failed" }>;
    }>
  | Readonly<{
      kind: "tool_state_changed";
      transition: Readonly<{ from: "running"; to: "indeterminate" }>;
      toolCall: Extract<ToolCallSnapshot, { state: "indeterminate" }>;
    }>
);

export type DurableRunEvent = MessageCommitted | RunTransitioned | ToolStateChanged;

export type MessageDelta = Readonly<{
  kind: "message_delta";
  durability: "transient";
  runId: RunId;
  executionId: ExecutionId;
  messageId: MessageId;
  offset: number;
  text: string;
}>;

export type ToolProgress = Readonly<{
  kind: "tool_progress";
  durability: "transient";
  runId: RunId;
  executionId: ExecutionId;
  toolCallId: ToolCallId;
  progress: JsonValue;
}>;

export type RunEvent = DurableRunEvent | MessageDelta | ToolProgress;
