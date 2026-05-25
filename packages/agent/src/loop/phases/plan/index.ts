import type { AgentLoopRuntime } from "../../../loop";
import { planTask } from "../../phases";
import { runtimeDepth } from "../../shared";
import type { PhaseDefinition, PhaseTransition } from "../types";
import type { PlanInput } from "./types";

export const planPhaseDefinition: PhaseDefinition<
  PlanInput,
  { task: NonNullable<AgentLoopRuntime["currentTask"]>; text: string }
> = {
  id: "plan",
  name: "Plan",
  description: "Create a concrete task from the current user request and available tools.",
  modelPhase: "plan",

  buildInput(runtime) {
    return {
      state: runtime.agentState,
      runtime: runtimeDepth(runtime),
    };
  },

  async run(context, input) {
    return planTask(context, input);
  },

  async apply(runtime, output): Promise<PhaseTransition> {
    runtime.currentTask = output.task;
    return { type: "next", phaseId: "execute" };
  },
};
