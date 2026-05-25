import type {
  AgentState,
  RuntimeDepth,
  Task,
  TaskOutput,
} from "../../../types";

export type VerifyInput = {
  state: AgentState;
  task: Task;
  taskOutput: TaskOutput;
  criteria: Task["acceptanceCriteria"];
  runtime: RuntimeDepth;
};
