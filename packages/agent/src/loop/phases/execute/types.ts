import type { AgentState, RuntimeDepth, Task, ToolResult } from "../../../types";

export type ExecuteInput = {
  state: AgentState;
  task: Task;
  toolResults: ToolResult[];
  runtime: RuntimeDepth;
};
