import { appendAssistantMessage } from "../../../../agent-loop";
import { createMessage } from "../../../../types";
import type { LoopPhaseOutputMap } from "../../../../types";
import { isInvalidModelSchemaError } from "../../../errors";
import {
  createInvalidExecuteToolResult,
  createToolTaskOutput,
  createUnverifiedTaskOutcome,
} from "../../../outcomes";
import { runtimeDepth } from "../../../state";
import type { ExecuteInput, ExecuteOutput } from "../../../types";
import type { BuiltinPhaseExtension } from "../types";
import manifestJson from "./manifest.json";
import type { PhaseConfigTemplatePhase } from "../../config";

export const executeExtension: BuiltinPhaseExtension<ExecuteInput, ExecuteOutput> = {
  manifest: manifestJson as PhaseConfigTemplatePhase,

  definition: {
    id: "execute",
    name: "Execute",
    description: "Call allowed tools for the current task and collect tool results.",
    modelPhase: "execute",
    async run(context, input) {
      let collected;
      try {
        collected = await context.model.collect({
          phase: "execute",
          payload: {
            phase: "execute",
            state: input.state,
            task: input.task,
            toolResults: input.toolResults,
            runtime: input.runtime,
          },
        });
      } catch (error) {
        if (!isInvalidModelSchemaError(error)) {
          throw error;
        }
        const result = createInvalidExecuteToolResult(error);
        input.toolResults.push(result);
        await context.messages.append(
          createMessage("tool", JSON.stringify(result), {
            toolCallId: result.toolCallId,
            toolName: result.toolName,
            scope: "execution",
          }),
        );
        return {
          text: "",
          toolCalls: [],
          taskOutput: createToolTaskOutput(input.toolResults),
        };
      }

      for (const toolCall of collected.toolCalls) {
        const result = await context.tools.execute({ task: input.task, toolCall });
        input.toolResults.push(result);
        await context.messages.append(
          createMessage("tool", JSON.stringify(result), {
            toolCallId: result.toolCallId,
            toolName: result.toolName,
            scope: "execution",
          }),
        );
      }

      const phaseOutput = collected.phaseOutput as LoopPhaseOutputMap["execute"] | undefined;
      return {
        text: phaseOutput?.text ?? collected.text,
        toolCalls: collected.toolCalls,
        taskOutput: createToolTaskOutput(input.toolResults),
      };
    },
  },

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

  async applyOutput({ runtime, phaseInput: input, phaseOutput: output }) {
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
