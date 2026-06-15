import Type from "typebox";
import type { LoopMetrics } from "./loop/types";
import type {
  AgentContextMessage,
  AgentContextSkill,
  LlmModelUsage,
  LlmRequest,
  LlmStreamEvent,
  LlmStreamOptions,
  Outcome,
  ToolResult,
} from "./protocol";
import type { AgentEvent, AgentEventListener, ContentBlock, LlmContentPart } from "@rowan-agent/models";
import { createId, createTimestamp } from "./utils";

export type {
  AgentRuntimePort,
  LoopMetrics,
  ToolRunner,
  AgentRunLimits,
} from "./loop/types";
export type { PhaseInput, PhaseOutput } from "./protocol/context";

export type {
  LlmModelRef,
  LlmModelUsage,
  LlmRequest,
  LlmStreamEvent,
  LlmStreamOptions,
  Outcome,
  StreamFn,
  ToolCall,
  ToolResult,
} from "./protocol";

export type { AgentEvent, AgentEventListener };

export type AgentMessage = AgentContextMessage;
export type Skill = AgentContextSkill;

export type ToolContext = Pick<AgentContext, "skills"> & { toolCallId: string };

export type ToolExecutionMode = "sequential" | "parallel";

export type Tool<TArgs = unknown> = {
  name: string;
  description: string;
  parameters: Type.TSchema;
  /** One-line snippet shown in the system prompt tool list. */
  promptSnippet?: string;
  /** Additional guidelines appended to the system prompt when this tool is active. */
  promptGuidelines?: string[];
  /** Whether this tool can run concurrently with others. Default: "parallel". */
  executionMode?: ToolExecutionMode;
  execute(args: TArgs, context: ToolContext, signal?: AbortSignal): Promise<ToolResult>;
};

/** Context snapshot passed into the low-level agent loop. */
export type AgentContext = {
  /** System prompt included with the request. */
  systemPrompt: string;
  /** Transcript visible to the model. */
  messages: AgentMessage[];
  /** Tools available for this run. */
  tools: Tool[];
  /** Skills available for this run. */
  skills: Skill[];
};

export type BeforeToolCall = (input: {
  tool: Tool;
  args: unknown;
}) => Promise<{ allow: true } | { allow: false; reason: string }>;

export type AfterToolCall = (input: {
  tool: Tool;
  result: ToolResult;
}) => Promise<ToolResult>;

export type RunResult = {
  sessionId: string;
  messages: AgentMessage[];
  outcome: Outcome;
  metrics: LoopMetrics;
};

export type Unsubscribe = () => void;

export function createMessage(
  role: AgentMessage["role"],
  content: AgentMessage["content"],
  metadata?: Record<string, unknown>,
): AgentMessage {
  return {
    id: createId("msg"),
    role,
    content,
    createdAt: createTimestamp(),
    ...(metadata ? { metadata } : {}),
  };
}

export function messageContentText(content: AgentMessage["content"]): string {
  if (typeof content === "string") {
    return content;
  }

  return content
    .map((part) => {
      if (part.type === "text") return part.text;
      if (part.type === "thinking") return part.thinking;
      if (part.type === "tool_result") return part.content;
      if (part.type === "tool_use") return JSON.stringify(part.input);
      if (part.type === "image") return `[image:${part.mimeType}]`;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

export function contentBlocksToMessageContent(blocks: ContentBlock[]): LlmContentPart[] {
  return blocks.map((block): LlmContentPart => {
    if (block.type === "text") {
      return { type: "text", text: block.text };
    }
    if (block.type === "thinking") {
      return { type: "thinking", thinking: block.thinking };
    }

    let input: unknown = block.args;
    try {
      input = JSON.parse(block.args);
    } catch {
      // Keep raw arguments when the provider streamed incomplete or non-JSON input.
    }
    return { type: "tool_use", id: block.id, name: block.name, input };
  });
}
