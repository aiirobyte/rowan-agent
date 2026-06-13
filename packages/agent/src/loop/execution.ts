import type {
  AgentMessage,
  AgentState,
  Tool,
  ToolCall,
  ToolResult,
} from "../types";
import type { ContentBlock, LlmRequest, LlmToolChoice } from "@rowan-agent/models";
import type { PhaseInput, PhaseOutput } from "../protocol/context";
import type { AgentRunState } from "./types";

export type { PhaseInput, PhaseOutput };

export type ModelInvokeOutput = {
  text: string;
  contentBlocks: ContentBlock[];
  toolCalls: ToolCall[];
  stopReason?: string;
};

export type ModelInvokeInput = {
  input: PhaseInput;
  /** Auto-execute tools and record results to message history */
  autoExecuteTools?: boolean;
  /** Max tool execution rounds (default: 10) */
  maxToolRounds?: number;
  /** Tool names to exclude from auto-execution (e.g. ["route"]) */
  excludeTools?: string[];
};

/** Snapshot of message state, used for restore */
export type MessageSnapshot = {
  transcriptLength: number;
  stateMessagesLength: number;
};

/** Message lifecycle manager for streaming updates */
export type PhaseMessageManager = {
  /** Get all visible messages in the transcript */
  visible(): AgentMessage[];
  /** Start a new message stream, returns message id */
  start(role: "assistant" | "tool", content: string, metadata?: Record<string, unknown>): string;
  /** Stream a text delta */
  update(messageId: string, delta: string): Promise<void>;
  /** End the message stream, appends to transcript */
  end(messageId: string): Promise<void>;
  /** Delete a single message by id or index */
  delete(target: string | number): void;
  /** Insert a message before a target (by id or index) */
  insert(target: string | number, message: AgentMessage): void;
  /** Clear all messages from transcript and state */
  clear(): void;
  /** Capture current message state for later restore */
  snapshot(): MessageSnapshot;
  /** Restore message state to a previous snapshot, discarding messages added after it */
  restore(snap: MessageSnapshot): void;
};

/** Tool execution lifecycle manager */
export type PhaseToolExecutionManager = {
  /** Start tool execution */
  start(toolCallId: string, toolName: string, args: unknown): Promise<void>;
  /** Update tool execution progress */
  update(toolCallId: string, partialResult: unknown): Promise<void>;
  /** End tool execution */
  end(toolCallId: string, toolName: string, result: ToolResult, isError: boolean): Promise<void>;
};

export type PhaseContext = {
  phaseId: string;
  state: AgentRunState;
  messages: PhaseMessageManager;
  toolExecution: PhaseToolExecutionManager;
  model: {
    invoke(input: ModelInvokeInput): Promise<ModelInvokeOutput>;
  };
  tools: {
    execute(input: { toolCall: ToolCall }): Promise<ToolResult>;
  };
  skills: AgentState["skills"];
  turn<T>(fn: () => Promise<T>): Promise<T>;
  maxAttempts?: number;
  incrementAttempt(): void;
  availablePhases: Array<{ id: string; name: string; description: string }>;
  /** Extract route decision from tool calls. Returns undefined if no route tool call found. */
  routeDecision(toolCalls: ToolCall[]): { route: string; reason?: string } | undefined;
};
