import type { ExtensionAPI } from "../../../../extensions";

export default function(api: ExtensionAPI) {
  api.registerPhase({
    ...api.manifest?.phase,
    id: "chat",

    async run(context, input) {
      const collected = await context.turn(() => context.model.invoke({ input }));

      // Abort check
      if (collected.stopReason === "aborted") {
        return { message: collected.text, route: "stop", toolCalls: collected.toolCalls };
      }

      // Return toolCalls for framework-level route extraction
      // Framework will handle route tool calls; non-route tools default to "execute"
      const nonRouteToolCalls = collected.toolCalls.filter(t => t.name !== "route");
      if (nonRouteToolCalls.length > 0) {
        return { message: collected.text.trim() || "Executing tools.", route: "execute", toolCalls: collected.toolCalls };
      }

      return { message: collected.text.trim() || "Done.", route: "stop", toolCalls: collected.toolCalls };
    },
  });
}
