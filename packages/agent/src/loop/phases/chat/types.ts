import type { AgentState, RuntimeDepth, Tool } from "../../../types";

export type ChatInput = {
  state: AgentState;
  runtime: RuntimeDepth;
  tools: Tool[];
  availablePhases: Array<{
    id: string;
    name: string;
    description: string;
  }>;
  workerTask?: string;
  workerGoal?: string;
};
