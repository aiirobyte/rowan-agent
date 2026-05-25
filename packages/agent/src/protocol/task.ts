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

export type TaskOutput = ToolTaskOutput;
