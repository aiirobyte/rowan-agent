import type { LlmPhase } from "./phase";
import type { ModelCallUsage, ModelRef } from "./model";
import type {
  AcceptanceCriterion,
  RuntimeDepth,
  Task,
  TaskOutput,
  TaskRoutingDecision,
  VerificationResult,
} from "./task";
import type { ToolCall, ToolResult } from "./tool";

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

export type AgentContextSession = {
  version: string;
  id: string;
  parentSessionId?: string;
  systemPrompt: string;
  input: string;
  task?: string;
  goal?: string;
  messages: AgentContextMessage[];
  log: unknown[];
  skills: AgentContextSkill[];
  createdAt: string;
  updatedAt: string;
  title?: string;
};

export type LlmContext<TSession extends AgentContextSession = AgentContextSession> =
  | {
      phase: "route";
      session: TSession;
      runtime?: RuntimeDepth;
    }
  | {
      phase: "plan";
      session: TSession;
      runtime?: RuntimeDepth;
    }
  | {
      phase: "execute";
      session: TSession;
      task: Task;
      toolResults: ToolResult[];
      runtime?: RuntimeDepth;
    }
  | {
      phase: "verify";
      session: TSession;
      task: Task;
      taskOutput: TaskOutput;
      criteria: AcceptanceCriterion[];
      runtime?: RuntimeDepth;
    };

export type LlmPhaseOutputMap = {
  route: TaskRoutingDecision & {
    text: string;
  };
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

export type LlmPhaseOutput<TPhase extends LlmPhase = LlmPhase> = LlmPhaseOutputMap[TPhase];

export type LlmPhaseOutputEvent<TPhase extends LlmPhase = LlmPhase> = {
  [TKey in TPhase]: {
    type: "phase_output";
    phase: TKey;
    output: LlmPhaseOutputMap[TKey];
  };
}[TPhase];

export type ModelStreamEvent =
  | { type: "text_delta"; text: string }
  | LlmPhaseOutputEvent
  | {
      type: "prompt_message";
      phase: LlmPhase;
      message: Pick<AgentContextMessage, "role" | "content">;
    }
  | {
      type: "model_requested";
      phase: LlmPhase;
      model: ModelRef;
      usage: ModelCallUsage;
    }
  | { type: "tool_call"; toolCall: ToolCall }
  | { type: "structured_output"; content: unknown }
  | { type: "done" };

export type StreamOptions = {
  signal?: AbortSignal;
};

export type StreamFn<TSession extends AgentContextSession = AgentContextSession> = (
  model: ModelRef,
  context: LlmContext<TSession>,
  options: StreamOptions,
) => AsyncIterable<ModelStreamEvent>;
