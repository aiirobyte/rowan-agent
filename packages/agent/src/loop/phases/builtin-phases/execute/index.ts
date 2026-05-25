import { appendAssistantMessage } from "../../../../loop";
import type { ExecuteOutput } from "../../../../types";
import {
  createUnverifiedTaskOutcome,
  runtimeDepth,
} from "../../../shared";
import type { ExecuteInput } from "../../../types";
import { executeTask } from "../../runtime";
import type { PhaseImplementation, PhaseTransition } from "../../config";

export const executePhaseImplementation: PhaseImplementation<ExecuteInput, ExecuteOutput> = {
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

export type { ExecuteInput } from "../../../types";
