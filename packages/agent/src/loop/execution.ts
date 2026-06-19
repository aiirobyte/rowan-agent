import type {
  AgentContext,
  AgentMessage,
  ToolCall,
  ToolResult,
} from "../types";
import type { LlmContentPart } from "@rowan-agent/models";
import type { ContentBlock } from "@rowan-agent/models";
import type { PhaseOutput, PhaseContext } from "../harness/phases/types";

export type { PhaseOutput };

export type ModelInvokeOutput = {
  text: string;
  contentBlocks: ContentBlock[];
  toolCalls: ToolCall[];
  stopReason?: string;
};

/** Snapshot of phase-level context for restore */
export type PhaseContextSnapshot = {
  systemPrompt: string;
  messages: AgentMessage[];
  currentPhase: string;
  availablePhases: string[];
  turnNumber: number;
  payload?: unknown;
};

/** Execution capabilities for a phase — operates on PhaseContext. */
export type PhaseExecution = {
  snapshot(): PhaseContextSnapshot;
  restore(snapshot: PhaseContextSnapshot): void;
  invokeModel(context: PhaseContext): Promise<ModelInvokeOutput>;
  executeTool(context: AgentContext, toolCall: ToolCall): Promise<ToolResult>;
};

/** Message lifecycle manager for streaming updates */
export type PhaseMessageManager = {
  /** Get all visible messages in the transcript */
  visible(): AgentMessage[];
  /** Start a new message stream, returns message id */
  start(role: "assistant" | "tool", content: AgentMessage["content"], metadata?: Record<string, unknown>): string;
  /** Stream a text delta */
  update(messageId: string, delta: string): Promise<void>;
  /** Replace the active message content with model-native content parts */
  replaceContent(messageId: string, content: string | LlmContentPart[]): void;
  /** End the message stream, appends to transcript */
  end(messageId: string): Promise<void>;
};

/** Tool execution lifecycle manager */
export type PhaseToolExecutionManager = {
  /** Start tool execution */
  start(toolCallId: string, toolName: string, args: unknown): Promise<void>;
  /** End tool execution */
  end(toolCallId: string, toolName: string, result: ToolResult, isError: boolean): Promise<void>;
};
