import type { LoopPhase } from "./phase";
import type {
  RuntimeDepth,
  Task,
  TaskOutput,
  VerificationResult,
} from "./task";
import type { ToolCall, ToolResult } from "./tool";
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
  task?: string;
  goal?: string;
  messages: AgentContextMessage[];
  skills: AgentContextSkill[];
  createdAt: string;
  updatedAt: string;
  title?: string;
};

export type LlmContext<TState extends AgentContextState = AgentContextState> =
  | {
      phase: "chat";
      state: TState;
      runtime?: RuntimeDepth;
      availablePhases?: Array<{
        id: string;
        name: string;
        description: string;
      }>;
    }
  | {
      phase: "plan";
      state: TState;
      runtime?: RuntimeDepth;
    }
  | {
      phase: "execute";
      state: TState;
      task: Task;
      toolResults: ToolResult[];
      runtime?: RuntimeDepth;
    }
  | {
      phase: "verify";
      state: TState;
      task: Task;
      taskOutput: TaskOutput;
      criteria: string[];
      runtime?: RuntimeDepth;
    };

export type PhaseOutput = {
  route: "direct" | string;
  message: string;
  text: string;
};

export type LoopPhaseOutputMap = {
  chat: PhaseOutput;
  plan: {
    task: Task;
    text: string;
  };
  execute: {
    text: string;
    toolCalls: ToolCall[];
  };
  verify: VerificationResult;
};

export type LoopPhaseOutput<TPhase extends LoopPhase = LoopPhase> = LoopPhaseOutputMap[TPhase];
