export type {
  LlmRequest,
  LlmStreamEvent,
  LlmStreamOptions,
  StreamFn,
} from "@rowan-agent/models";

export type ContextScope = "conversation" | "execution" | "diagnostic";

export type AgentContextMessage = {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown> & {
    kind?: string;
    phase?: string;
    scope?: ContextScope;
    /** Tool calls made by assistant (for native tool_use content blocks) */
    toolCalls?: Array<{ id: string; name: string; args: unknown }>;
    /** Tool call ID for tool result messages */
    toolCallId?: string;
    /** Tool name for tool result messages */
    toolName?: string;
    /** Whether the tool execution failed */
    isError?: boolean;
  };
};

export type AgentContextSkill = {
  id: string;
  path: string;
  content: string;
  toolNames?: string[];
};

export type AgentContextState = {
  version: string;
  id: string;
  parentSessionId?: string;
  systemPrompt: string;
  input: string;
  messages: AgentContextMessage[];
  skills: AgentContextSkill[];
  createdAt: string;
  updatedAt: string;
  title?: string;
};

export type Outcome = {
  id: string;
  taskId?: string;
  message: string;
};

/** Unified phase output — model decides routing via route. */
export type PhaseOutput = {
  message: string;
  route: string;
  /** Phase-specific data for the next phase */
  yield?: unknown;
};
