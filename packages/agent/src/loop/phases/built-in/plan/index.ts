import { Validators } from "../../../../types";
import type { LoopPhaseOutputMap, Task } from "../../../../types";
import { runtimeDepth } from "../../../state";
import type { PlanInput } from "../../../types";
import type { BuiltinPhaseExtension } from "../types";
import manifestJson from "./manifest.json";
import type { PhaseConfigTemplatePhase } from "../../config";

function parseTask(value: unknown): Task {
  return Validators.task.Parse(value);
}

export const planExtension: BuiltinPhaseExtension<
  PlanInput,
  { task: Task; text: string }
> = {
  manifest: manifestJson as PhaseConfigTemplatePhase,

  definition: {
    id: "plan",
    name: "Plan",
    description: "Create a concrete task from the current user request and available tools.",
    modelPhase: "plan",
    async run(context, input) {
      const collected = await context.model.collect({
        phase: "plan",
        payload: { phase: "plan", state: input.state, runtime: input.runtime },
      });

      const phaseOutput = collected.phaseOutput as LoopPhaseOutputMap["plan"] | undefined;
      const rawTask = phaseOutput?.task ?? collected.structured;
      if (!rawTask) {
        throw new Error("Planner did not produce a structured task.");
      }

      const task = parseTask(rawTask);
      return { task, text: phaseOutput?.text ?? collected.text };
    },
  },

  buildInput(runtime) {
    return {
      state: runtime.agentState,
      runtime: runtimeDepth(runtime),
    };
  },

  async applyOutput({ runtime, phaseOutput: output }) {
    runtime.currentTask = output.task;
    return { type: "next", phaseId: "execute" };
  },
};

export type { PlanInput } from "../../../types";
