import { defineExtension } from "../../../../extensions/types";
import manifest from "./package.json";

const manifestObject = manifest.rowan.phase;

export const chatPhaseExtension = defineExtension((rowan) => {
  rowan.registerPhase({
    ...manifestObject,

    prompt: {
      instructions: [
        "Phase: chat",
        "",
        "Answer the user's question directly in natural language.",
        "If the request requires tool access, call the available tools.",
        "When you have completed the response, call the 'route' tool to indicate the next phase or stop.",
        "Do NOT output JSON. Respond in the user's language.",
      ],
    },

    async run(context, input) {
      const collected = await context.turn(() => context.model.invoke({ input }));

      // Check if collection was stopped due to abort
      if (collected.stopReason === "aborted") {
        return { message: collected.text, route: "stop" };
      }

      // Check for route tool call
      const routeDecision = context.routeDecision(collected.toolCalls);
      if (routeDecision) {
        return {
          message: routeDecision.reason ?? (collected.text || "Done."),
          route: routeDecision.route,
        };
      }

      // If the model called other tools (not route), route to execute to handle them
      const nonRouteToolCalls = collected.toolCalls.filter(t => t.name !== "route");
      if (nonRouteToolCalls.length > 0) {
        return { message: collected.text.trim() || "Executing tools.", route: "execute" };
      }

      // No route tool call and no other tools - default to stop
      return { message: collected.text.trim() || "Done.", route: "stop" };
    },
  });
});
