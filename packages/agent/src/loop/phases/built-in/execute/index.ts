import type { ToolResult } from "../../registry";
import { defineExtension } from "../../../../extensions/types";
import packageJson from "./package.json";

const manifestJson = packageJson.rowan.phase;

export const executePhaseExtension = defineExtension((rowan) => {
  rowan.registerPhase({
    ...manifestJson,
    conversationLimit: 8,

    async run(context, input) {
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
        // Model errors (e.g. invalid schema) - route to verify to handle gracefully
        return { message: "", route: "verify", yield: { ...inputYield, toolResults } };
      }

      // Check if collection was stopped due to abort
      if (collected.stopReason === "aborted") {
        return { message: collected.text, route: "stop", yield: { ...inputYield, toolResults } };
      }

      // Use native tool calls from collected instead of parsing JSON
      for (const toolCall of collected.toolCalls) {
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

      return { message: collected.text ?? "", route: "verify", yield: { ...inputYield, toolResults } };
    },

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
        rowan.format.json(task ?? null),
        "",
        "Available tools with name, description, and parameters:",
        rowan.format.json(rowan.format.tools(input.tools)),
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
      return { id: rowan.id.create("out"), ...(taskId ? { taskId } : {}), passed: false, message: output.message };
    },
  });
});
