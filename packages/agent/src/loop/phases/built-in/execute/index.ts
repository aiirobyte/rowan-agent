import { createId } from "../../../../types";
import type { Outcome, ToolCall, ToolResult } from "../../../../types";
import type { PhaseInput, PhaseOutput, PhaseContext } from "../../config";
import { createPhaseDefinition, type PhaseHandler } from "../types";
import { LimitExceededError } from "../../../errors";
import { toJson, serializeTools } from "../../../../harness/context/prompt-builder";
import manifestJson from "./manifest.json";

function parseToolCall(value: unknown): ToolCall {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected tool call to be an object.");
  }
  const r = value as Record<string, unknown>;
  return {
    id: typeof r.id === "string" ? r.id : "",
    name: typeof r.name === "string" ? r.name : "",
    args: r.args,
  };
}

export const executeHandler: PhaseHandler = {
  definition: createPhaseDefinition(manifestJson, async (context, input) => {
    const inputYield = (input.yield as Record<string, unknown>) ?? {};
    const prevToolResults = (inputYield.toolResults as ToolResult[]) ?? [];
    const toolResults: ToolResult[] = [...prevToolResults];

    let collected;
    try {
      collected = await context.model.collect({
        phase: "execute",
        input,
      });
    } catch (error) {
      if (error instanceof LimitExceededError) {
        return { message: error.message, route: "stop", yield: { ...inputYield, toolResults } };
      }
      return { message: "", route: "verify", yield: { ...inputYield, toolResults } };
    }

    const raw = collected.structured as Record<string, unknown> | undefined;
    const rawToolCalls = Array.isArray(raw?.toolCalls) ? raw.toolCalls : [];
    const toolCalls = rawToolCalls.map((tc: unknown) => parseToolCall(tc));

    for (const toolCall of toolCalls) {
      try {
        context.consumeLimit("toolCalls");
      } catch (error) {
        if (error instanceof LimitExceededError) {
          return { message: error.message, route: "stop", yield: { ...inputYield, toolResults } };
        }
        throw error;
      }
      await context.toolExecution.start(toolCall.id, toolCall.name, toolCall.args);

      const result = await context.tools.execute({ toolCall });
      toolResults.push(result);

      await context.toolExecution.end(result.toolCallId, result.toolName, result, !result.ok);

      const toolMsgId = context.message.start("tool", JSON.stringify(result), {
        toolCallId: result.toolCallId,
        toolName: result.toolName,
        scope: "execution",
      });
      await context.message.end(toolMsgId);
    }

    const route = (raw?.route as string) ?? "verify";
    return { message: collected.text ?? "", route, yield: { ...inputYield, toolResults } };
  }),

  conversationLimit: 8,

  prepare(context) {
    context.incrementAttempt();
  },

  buildInput(context, yield_) {
    return {
      phase: "execute",
      systemPrompt: context.state.agentState.systemPrompt,
      messages: context.messages.visible(),
      tools: [], // Tools are passed through model.collect internally
      skills: context.skills,
      yield: yield_,
    };
  },

  buildPrompt(input) {
    const task = (input.yield as Record<string, unknown> | undefined)?.task;
    return [
      "Phase: execute",
      "",
      'JSON-only contract: output exactly an object shaped like `{ "message": string, "route": "execute" | "verify", "toolCalls": ToolCall[] }`.',
      "The message is a concise user-visible execution status.",
      "ToolCall fields: id, name, args.",
      'If no tool is needed, return `"toolCalls": []`.',
      "Call only tools listed in the task toolNames.",
      "",
      "Task:",
      toJson(task ?? null),
      "",
      "Available tools with name, description, and parameters:",
      toJson(serializeTools(input.tools)),
    ].join("\n");
  },

  finalize(context, output) {
    if (output.message.trim().length > 0) {
      context.setLastExecuteText(output.message);
    }
  },

  createOutcome(output) {
    const task = (output.yield as Record<string, unknown> | undefined)?.task as Record<string, unknown> | undefined;
    const taskId = typeof task?.id === "string" ? task.id : undefined;
    return { id: createId("out"), ...(taskId ? { taskId } : {}), passed: false, message: output.message };
  },
};
