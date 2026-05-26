import { createMessage, Validators } from "../../../../types";
import type { LlmContext } from "../../../../protocol";
import { isInvalidModelSchemaError } from "../../../errors";
import {
  createInvalidExecuteToolResult,
  createToolTaskOutput,
  createUnverifiedTaskOutcome,
} from "../../../outcomes";
import type { ExecuteInput, ExecuteOutput } from "../../../types";
import type { PhaseContext } from "../../config";
import { createPhaseDefinition, type PhaseHandler } from "../types";
import type { PromptTool } from "../../../../harness/context/prompt-builder";
import { toJson, serializeTools } from "../../../../harness/context/prompt-builder";
import manifestJson from "./manifest.json";

function requireExecuteContext(context: LlmContext): Extract<LlmContext, { phase: "execute" }> {
  if (context.phase !== "execute") {
    throw new Error(`Expected execute context, received ${context.phase}.`);
  }
  return context as Extract<LlmContext, { phase: "execute" }>;
}

export const executeHandler: PhaseHandler<ExecuteInput, ExecuteOutput> = {
  definition: createPhaseDefinition(manifestJson, async (context, input) => {
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

    const raw = collected.structured as Record<string, unknown> | undefined;
    const rawToolCalls = Array.isArray(raw?.toolCalls) ? raw.toolCalls : [];
    const toolCalls = rawToolCalls.map((tc: unknown) => Validators.toolCall.Parse(tc));

    for (const toolCall of toolCalls) {
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

    return {
      text: collected.text,
      toolCalls,
      taskOutput: createToolTaskOutput(input.toolResults),
    };
  }),

  conversationLimit: 8,

  prepare(context) {
    context.incrementAttempt();
    const task = context.state.task!;
    task.status = "running";
    task.attempts = context.state.attempt;
  },

  buildInput(context) {
    const task = context.state.task!;
    return {
      state: context.state.agentState,
      task,
      toolResults: context.state.toolResults,
      runtime: context.state.depth,
    };
  },

  buildPrompt(context, tools) {
    const ctx = requireExecuteContext(context);
    const allowedToolNames = new Set(ctx.task.toolNames);
    const allowedTools = serializeTools(tools).filter((t) => allowedToolNames.has(t.name));
    return [
      "Phase: execute",
      "",
      'JSON-only contract: output exactly an object shaped like `{ "message": string, "toolCalls": ToolCall[] }`.',
      "The message is a concise user-visible execution status and must be preserved before tool calls are recorded.",
      "ToolCall fields: id, name, args.",
      'If no tool is needed, return `"toolCalls": []`.',
      "Do not return a task, plan, verificationResult, or passed in this phase.",
      "If more information is needed, call one or more allowed tools now instead of describing a plan.",
      "Call only tools listed in the task toolNames and allowed tools below.",
      "File and command tool paths are relative to the workspace; use `.` or an empty string for the workspace root, not filesystem `/`.",
      "For bash commands, avoid unescaped backticks inside double-quoted command strings because bash treats them as command substitution; prefer simple commands, single quotes, or here-docs for multi-line scripts.",
      "",
      "Task:",
      toJson(ctx.task),
      "",
      "Allowed tool names:",
      toJson(ctx.task.toolNames),
      "",
      "Allowed tools with name, description, and parameters:",
      toJson(allowedTools),
      "",
      "Existing toolResults:",
      toJson(ctx.toolResults),
    ].join("\n");
  },

  finalize(context, output) {
    if (output.text.trim().length > 0) {
      context.setLastExecuteText(output.text);
    }
  },

  async applyOutput(context, input, output) {
    if (!context.availablePhases.some((p) => p.id === "verify")) {
      const task = input.task;
      const outcome = createUnverifiedTaskOutcome(
        { lastExecuteText: output.text },
        task,
        input.toolResults,
      );
      task.status = outcome.passed ? "passed" : "failed";
      if (outcome.passed) {
        await context.messages.appendState(
          createMessage("assistant", outcome.message, {
            kind: "task_outcome",
            taskId: task.id,
          }),
        );
      }
      return { type: "stop", outcome };
    }

    return { type: "next", phaseId: "verify" };
  },
};

export type { ExecuteInput } from "../../../types";