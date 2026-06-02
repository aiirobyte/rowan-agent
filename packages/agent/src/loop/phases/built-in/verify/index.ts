import { defineExtension } from "../../../../extensions/types";

export default defineExtension((rowan) => {
  rowan.registerPhase({
    ...rowan.manifest.phase!,

    prompt: {
      instructions: [
        "Phase: verify",
        "",
        "Review the task output against the acceptance criteria.",
        "If the criteria are met, confirm and call the 'route' tool to stop or proceed.",
        "If more work is needed, call tools to fix issues, then call the 'route' tool.",
        "Do NOT output JSON.",
      ],
    },

    async run(context, input) {
      const task = (input.yield as Record<string, unknown> | undefined)?.task;
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
            yield: { task },
          };
        }
        return {
          message: "Verification error, no retries remaining.",
          route: "stop",
          yield: { task },
        };
      }

      // Check for route tool call
      const routeDecision = context.routeDecision(collected.toolCalls);

      // If model called non-route tools, execute them
      const nonRouteToolCalls = collected.toolCalls.filter(t => t.name !== "route");
      if (nonRouteToolCalls.length > 0) {
        // If route tool was also called, use that route
        if (routeDecision) {
          return {
            message: routeDecision.reason ?? (collected.text || "Fixing issues."),
            route: routeDecision.route,
            yield: { task },
          };
        }
        // No route tool - model should have called it, default to stop
        return {
          message: collected.text || "Verification with fixes attempted.",
          route: "stop",
          yield: { task },
        };
      }

      // Use route decision if available
      if (routeDecision) {
        return {
          message: routeDecision.reason ?? collected.text.trim(),
          route: routeDecision.route,
          yield: { task },
        };
      }

      // No route tool call and no other tools - default to stop
      return {
        message: collected.text.trim() || "Verification complete.",
        route: "stop",
        yield: { task },
      };
    },
  });
});
