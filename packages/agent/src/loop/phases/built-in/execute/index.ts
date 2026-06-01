import type { ToolResult } from "../../registry";
import { defineExtension } from "../../../../extensions/types";
import packageJson from "./package.json";

const manifestJson = packageJson.rowan.phase;

export const executePhaseExtension = defineExtension((rowan) => {
  rowan.registerPhase({
    ...manifestJson,

    prompt: {
      sections: [
        { type: "instructions", lines: [
          "Phase: execute",
          "",
          "Execute the task by calling the appropriate tools.",
          "If more tool calls are needed, continue calling tools.",
          "If execution is complete, respond with a brief summary.",
          "Do NOT output JSON. Use the provided tools directly.",
        ]},
        { type: "task" },
        { type: "tools" },
      ],
      withToolResults: true,
    },

    async run(context, input) {
      context.incrementAttempt();

      const inputYield = (input.yield as Record<string, unknown>) ?? {};
      const prevToolResults = (inputYield.toolResults as ToolResult[]) ?? [];
      const toolResults: ToolResult[] = [...prevToolResults];

      let collected;
      try {
        collected = await context.turn(() => context.model.collect({
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

        const toolMsgId = context.messages.start("tool", JSON.stringify(result), {
          toolCallId: result.toolCallId,
          toolName: result.toolName,
          scope: "execution",
        });
        await context.messages.end(toolMsgId);
      }

      return { message: collected.text ?? "", route: "verify", yield: { ...inputYield, toolResults } };
    },
  });
});
