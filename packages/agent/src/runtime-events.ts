import type { RunInteraction } from "./harness/phases/interactions";
import type { PhaseStatus } from "./harness/phases/types";
import type {
  ContentBlock,
  ToolAnnotations,
  ToolCall,
  ToolCallContent,
  ToolCallLocation,
  ToolCallStatus,
  ToolCallUpdate,
  ToolKind,
} from "@rowan-agent/models";

export type {
  ContentBlock,
  ToolAnnotations,
  ToolCall,
  ToolCallContent,
  ToolCallLocation,
  ToolCallStatus,
  ToolCallUpdate,
  ToolKind,
} from "@rowan-agent/models";

declare const opaqueIdBrand: unique symbol;

export type OpaqueId<Kind extends string> = string & {
  readonly [opaqueIdBrand]: Kind;
};

export type AgentId = OpaqueId<"AgentId">;
export type RunId = OpaqueId<"RunId">;
export type MessageId = OpaqueId<"MessageId">;
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
  /** Provider/model correlation, retained only to reconstruct the next request. */
  providerToolCallId?: string;
  name: string;
  input: JsonValue;
}>;

export type ToolExecutionResult =
  | Readonly<{ ok: true; content: JsonValue; structuredContent?: JsonValue; isError?: boolean }>
  | Readonly<{ ok: false; content: JsonValue; error: string; structuredContent?: JsonValue; isError?: boolean }>
  | Readonly<{ content: readonly ContentBlock[]; structuredContent?: JsonValue; isError?: boolean; ok?: boolean; error?: string }>;

export type DurableToolResult = Readonly<{
  toolCallId: ToolCallId;
  toolName: string;
}> & ToolExecutionResult;

export type ToolResultContent = Readonly<{
  type: "tool_result";
  toolCallId: ToolCallId;
  /** Provider/model correlation, retained only to reconstruct the next request. */
  providerToolCallId?: string;
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
  /** Monotonic active revision. Omitted on legacy/initial messages and read as 0. */
  messageRevision?: number;
  metadata?: Metadata;
  sequenceWithinRun: number;
  createdAt: string;
}>;

export type UserMessage = MessageBase & Readonly<{ role: "user"; content: UserContent }>;
export type AssistantMessage = MessageBase & Readonly<{ role: "assistant"; content: AssistantContent; interrupted?: boolean }>;
export type ToolMessage = MessageBase & Readonly<{ role: "tool"; content: ToolMessageContent }>;
export type InteractionRecord = MessageBase & Readonly<{
  role: "interaction";
  interactionId: string;
  kind: "user_input" | "permission" | "elicitation" | "confirmation";
  prompt: string;
  phase: string;
  status: "answered" | "replied" | "cancelled";
  answer?: JsonValue;
  reply?: string;
  toolCallId?: ToolCallId;
  result?: Readonly<{
    answered?: string;
    replied?: string;
    cancelled?: string;
  }>;
}>;
export type Message = UserMessage | AssistantMessage | ToolMessage | InteractionRecord;

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

export type WithdrawnUserInput = Readonly<{
  messageId: MessageId;
  content: UserContent;
}>;

export type RunFailure =
  | Readonly<{ code: "configuration_unavailable"; message: string; withdrawnInput?: WithdrawnUserInput }>
  | Readonly<{
      code: "checkpoint_incompatible";
      message: string;
      expected: Readonly<{ codec: string; versions: readonly number[] }>;
      actual: Readonly<{ codec: string; version: number }>;
      withdrawnInput?: WithdrawnUserInput;
    }>
  | Readonly<{ code: "runtime_interrupted"; message: string; ownerEpoch: number; withdrawnInput?: WithdrawnUserInput }>
  | Readonly<{
      code: "tool_indeterminate";
      message: string;
      toolCallIds: readonly [ToolCallId, ...ToolCallId[]];
      withdrawnInput?: WithdrawnUserInput;
    }>
  | Readonly<{ code: "execution_failed"; message: string; details?: JsonValue; withdrawnInput?: WithdrawnUserInput }>;

export type QueuedRunFailure = Extract<
  RunFailure,
  { code: "configuration_unavailable" | "checkpoint_incompatible" }
>;
export type RunningRunFailure = Extract<
  RunFailure,
  { code: "runtime_interrupted" | "tool_indeterminate" | "execution_failed" }
>;

export type ToolCallState = ToolCallStatus;
export type ToolCallSnapshot = ToolCall & Readonly<{
  id: ToolCallId;
  providerToolCallId?: string;
  agentId?: AgentId;
  runId?: RunId;
  executionId?: ExecutionId;
  requestMessageId?: MessageId;
  name?: string;
  args?: JsonValue;
  state?: ToolCallStatus;
  result?: DurableToolResult;
  resultMessageId?: MessageId;
  reason?: string;
  external?: boolean;
  createdAt?: string;
  updatedAt?: string;
}>;

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

export type PhaseEntered = DurableEventBase & Readonly<{
  kind: "phase_entered";
  executionId: ExecutionId;
  phaseId: string;
  visit: number;
}>;

export type MessageCommitted = DurableEventBase & Readonly<{
  kind: "message_committed";
  message: Message;
}>;

export type MessageRevised = DurableEventBase & Readonly<{
  kind: "message_revised";
  message: UserMessage;
  previousRevision: number;
  invalidatedRunIds: readonly RunId[];
  targetRunId: RunId;
  cutoffSequenceWithinRun: number;
}>;

export type RunStateChanged = DurableEventBase & (
  | Readonly<{ kind: "run_state_changed"; from: null; to: "queued" }>
  | Readonly<{ kind: "run_state_changed"; from: "input_required"; to: "queued" }>
  | Readonly<{ kind: "run_state_changed"; from: "queued"; to: "running" }>
  | Readonly<{
      kind: "run_state_changed";
      from: "running";
      to: "input_required";
      interactions: readonly RunInteraction[];
      answers: Readonly<Record<string, JsonValue>>;
    }>
  | Readonly<{
      kind: "run_state_changed";
      from: "running";
      to: "completed";
      outcome: Outcome;
      output?: AssistantMessage;
    }>
  | Readonly<{ kind: "run_state_changed"; from: "queued"; to: "failed"; failure: QueuedRunFailure; withdrawnInput?: WithdrawnUserInput }>
  | Readonly<{ kind: "run_state_changed"; from: "running"; to: "failed"; failure: RunningRunFailure; withdrawnInput?: WithdrawnUserInput }>
  | Readonly<{
      kind: "run_state_changed";
      from: "queued" | "running" | "input_required";
      to: "cancelled";
      reason?: string;
    }>
);

export type ToolStateChanged =
  | (DurableEventBase & Readonly<{
      kind: "tool_state_changed";
      transition: Readonly<{ from: ToolCallStatus | null; to: ToolCallStatus }>;
      toolCall: ToolCall;
      external?: boolean;
    }>)
  | Readonly<{
      kind: "tool_state_changed";
      durability: "transient";
      runId: RunId;
      executionId?: ExecutionId;
      transition: Readonly<{ from: ToolCallStatus | null; to: ToolCallStatus }>;
      toolCall: ToolCall | ToolCallUpdate;
      external?: boolean;
    }>;

export type DurableRunEvent =
  | PhaseEntered
  | MessageCommitted
  | MessageRevised
  | RunStateChanged
  | Extract<ToolStateChanged, { durability: "durable" }>;

export type MessageDelta = Readonly<{
  kind: "message_delta";
  durability: "transient";
  runId: RunId;
  executionId: ExecutionId;
  messageId: MessageId;
  offset: number;
  text: string;
}>;

export type ThinkingDelta = Readonly<{
  kind: "thinking_delta";
  durability: "transient";
  runId: RunId;
  executionId: ExecutionId;
  messageId: MessageId;
  blockIndex: number;
  offset: number;
  text: string;
}>;

export type ToolCallDelta = Readonly<{
  kind: "tool_call_delta";
  durability: "transient";
  runId: RunId;
  executionId: ExecutionId;
  messageId: MessageId;
  providerToolCallId: string;
  toolName: string;
  arguments: string;
  args: JsonValue | undefined;
}>;

export type PhaseStatusEvent = Readonly<{
  kind: "phase_status";
  durability: "transient";
  runId: RunId;
  executionId: ExecutionId;
  phaseId: string;
  status: PhaseStatus;
}>;

export type ModelRetry = Readonly<{
  kind: "model_retry";
  durability: "transient";
  runId: RunId;
  executionId: ExecutionId;
  attempt: number;
  maxRetries: number;
  delayMs: number;
  error: string;
}>;

export type RunEvent =
  | DurableRunEvent
  | MessageDelta
  | ThinkingDelta
  | ToolCallDelta
  | PhaseStatusEvent
  | ModelRetry
  | Extract<ToolStateChanged, { durability: "transient" }>;

