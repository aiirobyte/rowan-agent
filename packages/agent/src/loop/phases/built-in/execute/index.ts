import { createId, toJson, serializeTools, LimitExceededError, type Outcome, type ToolCall, type ToolResult, type PhaseInput, type PhaseOutput, type PhaseContext } from "../../config";
import type { ExtensionFactory } from "../../../../extensions";
import manifestJson from "./manifest.json";

async function run(context: PhaseContext, input: PhaseInput): Promise<PhaseOutput> {
  const inputYield = (input.yield as Record<string, unknown>) ?? {};
  const prevToolResults = (inputYield.toolResults as ToolResult[]) ?? [];
  const toolResults: ToolResult[] = [...prevToolResults];

  let collected;
  try {
    collected = await context.turn(() => context.model.collect({
      phase: "execute",
      input,
      toolResults: toolResults.length > 0 ? toolResults : undefined,
    }));
  } catch (error) {
    if (error instanceof LimitExceededError) {
      return { message: error.message, route: "stop", yield: { ...inputYield, toolResults } };
    }
    return { message: "", route: "verify", yield: { ...inputYield, toolResults } };
  }

  // Use native tool calls from collected instead of parsing JSON
  for (const toolCall of collected.toolCalls) {
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

  // If model called tools, route back to execute for more; if text-only, route to verify
  const route = collected.toolCalls.length > 0 ? "verify" : "verify";
  return { message: collected.text ?? "", route, yield: { ...inputYield, toolResults } };
}

export const executeExtension: ExtensionFactory = (api) => {
  api.registerPhase(manifestJson, {
    conversationLimit: 8,

    prepare(context) {
      context.incrementAttempt();
    },

    buildInput(context, yield_) {
      return {
        phase: "execute",
        systemPrompt: context.state.agentState.systemPrompt,
        messages: context.messages.visible(),
        tools: [],
        skills: context.skills,
        yield: yield_,
      };
    },

    buildPrompt(input) {
      const task = (input.yield as Record<string, unknown> | undefined)?.task;
      return [
        "Phase: execute",
        "",
        "Execute the task by calling the appropriate tools.",
        "If more tool calls are needed, continue calling tools.",
        "If execution is complete, respond with a brief summary.",
        "Do NOT output JSON. Use the provided tools directly.",
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
  }, run);
};
