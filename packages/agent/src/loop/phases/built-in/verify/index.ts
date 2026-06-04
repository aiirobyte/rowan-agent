import type { ExtensionAPI } from "../../../../extensions";

export default function(api: ExtensionAPI) {
  api.registerPhase({
    ...api.manifest?.phase,
    id: "verify",

    prompt: {
      instructions: [
        "Phase: verify",
        "",
        "Review the task output against the acceptance criteria.",
        "If the criteria are met, confirm and call the 'route' tool to stop or proceed.",
        "If more work is needed, call tools to fix issues, then call the 'route' tool.",
      ],
    },

    async run(context, input) {
      const maxAttempts = context.maxAttempts ?? 2;

      let collected;
      try {
        collected = await context.turn(() => context.model.invoke({ input }));
      } catch (error) {
        // Model errors - check if we should retry
        if (context.state.attempt < maxAttempts) {
          return {
            message: "Verification error, retrying.",
            route: "execute",
          };
        }
        return {
          message: "Verification error, no retries remaining.",
          route: "stop",
        };
      }

      // If model called non-route tools, execute them
      const nonRouteToolCalls = collected.toolCalls.filter(t => t.name !== "route");
      if (nonRouteToolCalls.length > 0) {
        // Return with route to execute for tool execution
        return {
          message: collected.text || "Fixing issues.",
          route: "execute",
          toolCalls: collected.toolCalls,
        };
      }

      // Return toolCalls for framework route extraction
      return {
        message: collected.text.trim() || "Verification complete.",
        route: "stop",
        toolCalls: collected.toolCalls,
      };
    },
  });
}
