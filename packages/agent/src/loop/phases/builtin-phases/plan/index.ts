import type { AgentLoopRuntime } from "../../../../loop";
import { runtimeDepth } from "../../../shared";
import type { PlanInput } from "../../../types";
import { planTask } from "../../runtime";
import type { PhaseImplementation, PhaseTransition } from "../../config";

export const planPhaseImplementation: PhaseImplementation<
  PlanInput,
  { task: NonNullable<AgentLoopRuntime["currentTask"]>; text: string }
> = {
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

export type { PlanInput } from "../../../types";
