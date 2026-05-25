import { appendAssistantMessage } from "../../../loop";
import type { ExecuteOutput } from "../../../types";
import { executeTask } from "../../phases";
import {
  createUnverifiedTaskOutcome,
  runtimeDepth,
} from "../../shared";
import type { PhaseDefinition, PhaseTransition } from "../types";
import type { ExecuteInput } from "./types";

export const executePhaseDefinition: PhaseDefinition<ExecuteInput, ExecuteOutput> = {
  id: "execute",
  name: "Execute",
  description: "Call allowed tools for the current task and collect tool results.",
  modelPhase: "execute",

  async buildInput(runtime) {
    const task = runtime.currentTask!;
    runtime.attempt = (runtime.attempt || 0) + 1;
    task.status = "running";
    task.attempts = runtime.attempt;

    return {
      state: runtime.agentState,
      task,
      toolResults: runtime.toolResults,
      runtime: runtimeDepth(runtime),
    };
  },

  async run(context, input) {
    return executeTask(context, input);
  },

  async apply(runtime, output, input): Promise<PhaseTransition> {
    if (output.text.trim().length > 0) {
      runtime.lastExecuteText = output.text;
    }

    const hasVerifyPhase = runtime.phaseConfig?.phases.some((phase) => phase.id === "verify") ?? true;
    if (!hasVerifyPhase) {
      const outcome = createUnverifiedTaskOutcome(runtime, input.task, runtime.toolResults);
      input.task.status = outcome.passed ? "passed" : "failed";
      if (outcome.passed) {
        await appendAssistantMessage(runtime, outcome.message, {
          kind: "task_outcome",
          taskId: input.task.id,
        });
      }
      return { type: "stop", outcome };
    }

    return { type: "next", phaseId: "verify" };
  },
};
