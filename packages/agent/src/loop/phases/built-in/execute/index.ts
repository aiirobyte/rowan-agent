import type { ExtensionAPI } from "../../../../extensions";

export default function(api: ExtensionAPI) {
  api.registerPhase({
    ...api.manifest?.phase,
    id: "execute",

    prompt: {
      instructions: [
        "Phase: execute",
        "",
        "Execute the task by calling the appropriate tools.",
        "If more tool calls are needed, continue calling tools.",
        "If execution is complete, respond with a brief summary and call the 'route' tool.",
      ],
    },

    async run(context, input) {
      context.incrementAttempt();

      const maxAttempts = context.maxAttempts ?? 2;

      let collected;
      try {
        collected = await context.turn(() => context.model.invoke({
          input,
          autoExecuteTools: true,
          excludeTools: ["route"],
        }));
      } catch (error) {
        // Model errors - check if we should retry
        if (context.state.attempt < maxAttempts) {
          return {
            message: "Execution error, retrying.",
            route: "execute",
          };
        }
        return {
          message: "Execution error, no retries remaining.",
          route: "stop",
        };
      }

      // Check if collection was stopped due to abort
      if (collected.stopReason === "aborted") {
        return { message: collected.text, route: "stop", toolCalls: collected.toolCalls };
      }

      // If there are tool calls (including route), return them for framework route extraction
      if (collected.toolCalls.length > 0) {
        return { message: collected.text ?? "", route: "stop", toolCalls: collected.toolCalls };
      }

      // No tools called - execution complete
      return { message: collected.text ?? "", route: "chat" };
    },
  });
}
