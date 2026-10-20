import type { AgentContext } from "./types";
import type { AgentMessage } from "../protocol/agent";
import type {
  LlmContentBlock,
  LlmToolCall,
  LlmTokenUsage,
  ModelRef,
  StreamBlock,
  ToolResult,
} from "@rowan-agent/models";
import type { ToolResultRecord } from "../runtime-events";
import type { PhaseOutput, PhaseContext, PhaseStatus } from "../harness/phases/types";
import type { RunInteractionDriver } from "../harness/phases/interactions";
import type { AgentConfiguration } from "../runtime/configuration-snapshot";
import type { UserInput } from "../runtime/contracts";
import type { AgentId, JsonObject, RunId } from "../runtime-events";

export type { PhaseOutput };

export type ModelInvokeOutput = {
  text: string;
  contentBlocks: StreamBlock[];
  toolCalls: LlmToolCall[];
  stopReason?: string;
  model?: ModelRef;
  usage?: LlmTokenUsage;
};

export type InternalModelLoopOptions = {
  prompt: string;
  tools?: readonly string[];
  maxToolRounds?: number;
};

/** Execution capabilities for a phase — operates on PhaseContext. */
export type PhaseExecution = {
  invokeModel(context: PhaseContext, options?: { output?: "reply" | "internal" }): Promise<ModelInvokeOutput>;
  runInternalModelLoop(context: PhaseContext, options: InternalModelLoopOptions): Promise<ModelInvokeOutput>;
  reportStatus(status: PhaseStatus): Promise<void>;
  executeTools(
    context: AgentContext,
    toolCalls: readonly LlmToolCall[],
    contentBlocks?: readonly StreamBlock[],
    meta?: { model?: ModelRef; usage?: LlmTokenUsage },
  ): Promise<readonly ToolResultRecord[]>;
  interaction: RunInteractionDriver;
  /** Child Agents of the Agent running this Phase. */
  agents: {
    /**
     * Creates a child Agent and starts its Run, or continues a child given by
     * `agentId`: a Run waiting for input resumes with `input` as the answer, a
     * running one queues a new Run behind it, a settled one starts a new Run.
     * The child runs in the background and reports back to this Agent.
     */
    delegate(options: DelegateOptions): Promise<DelegateResult>;
  };
  /** Message lifecycle manager for streaming updates from programmatic phases */
  messages: PhaseMessageManager;
};

/** Message lifecycle manager for streaming updates */
export type PhaseMessageManager = {
  /** Get all visible messages in the transcript */
  visible(): AgentMessage[];
  /** Reserve the eventual message identity before stream deltas arrive. */
  reserve(role: "assistant" | "tool", metadata?: Record<string, unknown>): string;
  /** Start a new message stream, returns message id */
  start(role: "assistant" | "tool", content: AgentMessage["content"], metadata?: Record<string, unknown>): string;
  /** Stream a text delta */
  update(messageId: string, delta: string): Promise<void>;
  /** Replace the active message content with model-native content parts */
  replaceContent(messageId: string, content: string | LlmContentBlock[]): void;
  /** End the message stream, appends to transcript */
  end(messageId: string, meta?: { model?: ModelRef; usage?: LlmTokenUsage }): Promise<void>;
  /** Drop an unstarted stream that produced no content. */
  discard(messageId: string): void;
};

/** Tool execution lifecycle manager */
export type PhaseToolExecutionManager = {
  /** Start tool execution */
  start(toolCallId: string, toolName: string, args: unknown): Promise<void>;
  /** End tool execution */
  end(toolCallId: string, toolName: string, result: ToolResult, isError: boolean): Promise<void>;
};

/** Starts or continues a child Agent of the Agent running the Phase. */
export type DelegateOptions = Readonly<{
  /** A child to continue; omitted, a new child is created. */
  agentId?: AgentId;
  /** Builds the new child's configuration; called only when creating. */
  create: () => AgentConfiguration | Promise<AgentConfiguration>;
  input: UserInput;
  /** Agent metadata and the first Run's metadata when creating; Run metadata when continuing. */
  metadata?: JsonObject;
  /** Defaults to a key derived from this Phase execution, so a re-executed Phase finds its child again. */
  idempotencyKey?: string;
}>;

export type DelegateResult = Readonly<{ agentId: AgentId; runId: RunId; created: boolean }>;
