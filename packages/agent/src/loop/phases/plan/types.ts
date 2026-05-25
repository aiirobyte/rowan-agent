import type { AgentState, RuntimeDepth } from "../../../types";

export type PlanInput = {
  state: AgentState;
  runtime: RuntimeDepth;
};
