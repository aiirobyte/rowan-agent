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
          "If execution is complete, respond with a brief summary and call the 'route' tool.",
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
      const maxAttempts = context.maxAttempts ?? 2;

      let collected;
      try {
        collected = await context.turn(() => context.model.collect({
          input,
          toolResults: toolResults.length > 0 ? toolResults : undefined,
        }));
      } catch (error) {
        // Model errors - check if we should retry
        if (context.state.attempt < maxAttempts) {
          return {
            message: "Execution error, retrying.",
            route: "execute",
            yield: { ...inputYield, toolResults },
          };
        }
        return {
          message: "Execution error, no retries remaining.",
          route: "stop",
          yield: { ...inputYield, toolResults },
        };
      }

      // Check if collection was stopped due to abort
      if (collected.stopReason === "aborted") {
        return { message: collected.text, route: "stop", yield: { ...inputYield, toolResults } };
      }

      // Check for route tool call first
      const routeDecision = context.routeDecision(collected.toolCalls);

      // Execute non-route tool calls
      for (const toolCall of collected.toolCalls) {
        // Skip route tool - it's handled by routing logic, not execution
        if (toolCall.name === "route") continue;

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

      // Use route decision if available
      if (routeDecision) {
        return {
          message: routeDecision.reason ?? collected.text ?? "",
          route: routeDecision.route,
          yield: { ...inputYield, toolResults },
        };
      }

      // Default: route back to chat so model can generate response based on tool results
      return { message: collected.text ?? "", route: "chat", yield: { ...inputYield, toolResults } };
    },
  });
});
