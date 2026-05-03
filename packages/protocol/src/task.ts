import type { ToolResult } from "./tool";

export type AcceptanceCriterion =
  | {
      id: string;
      type: "model_judge";
      description: string;
      required: boolean;
    }
  | {
      id: string;
      type: "tool_observation";
      description: string;
      toolName?: string;
      required: boolean;
    };

export type Task = {
  id: string;
  title: string;
  instruction: string;
  acceptanceCriteria: AcceptanceCriterion[];
  toolNames: string[];
  skillIds: string[];
  status: "pending" | "running" | "passed" | "failed";
  attempts: number;
};

export type TaskRoutingDecision = {
  route: "direct" | "task" | "thread";
  message: string;
  thread?: {
    prompt: string;
    task: string;
    goal: string;
  };
};

export type VerificationResult = {
  passed: boolean;
  message: string;
};

export type Outcome = {
  id: string;
  taskId?: string;
  passed: boolean;
  message: string;
};

export type AgentRunLimits = {
  maxToolCalls?: number;
  maxModelCalls?: number;
  maxThreadDepth?: number;
};

export type AgentLimitUsage = {
  toolCalls: number;
  modelCalls: number;
};

export type RuntimeDepth = {
  threadDepth: number;
  maxThreadDepth: number;
};

export type ToolTaskOutput = {
  kind: "tools";
  toolResults: ToolResult[];
};

export type ThreadTaskOutput = {
  kind: "thread";
  sessionId: string;
  parentSessionId: string;
  prompt: string;
  task: string;
  goal: string;
  outcome: Outcome;
  limitUsage: AgentLimitUsage;
  threadDepth: number;
  maxThreadDepth: number;
};

export type TaskOutput = ToolTaskOutput | ThreadTaskOutput;
