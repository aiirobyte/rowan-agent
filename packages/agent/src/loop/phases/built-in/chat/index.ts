import { defineExtension } from "../../../../extensions/context";

export default defineExtension((ctx) => {
  ctx.registerPhase({
    ...ctx.manifest?.phase,
    id: "chat",

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
