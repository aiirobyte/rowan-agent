import type { ToolResult } from "./tool";

export type Task = {
  id: string;
  title: string;
  instruction: string;
  acceptanceCriteria: string[];
  toolNames: string[];
  skillIds: string[];
  status: "pending" | "running" | "passed" | "failed";
  attempts: number;
};

export type RoutingDecision = {
  /**
   * Routing target:
   * - "direct": Answer directly without entering phase loop
   * - "<phase-id>": Target phase ID to execute (e.g., "plan", "execute", "verify", "custom-phase")
   */
  route: "direct" | string;
  message: string;
  /**
   * @deprecated Use route to specify target phase instead
   * Kept for backward compatibility
   */
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
