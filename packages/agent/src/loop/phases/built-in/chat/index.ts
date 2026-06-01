import { defineExtension } from "../../../../extensions/types";
import manifest from "./package.json";

const manifestObject = manifest.rowan.phase;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const chatPhaseExtension = defineExtension((rowan) => {
  rowan.registerPhase({
    ...manifestObject,

    prompt: {
      sections: [
        { type: "instructions", lines: [
          "Phase: chat",
          "",
          "Answer the user's question directly in natural language.",
          "If the request requires tool access, call the available tools.",
          "Do NOT output JSON. Respond in the user's language.",
        ]},
        { type: "userRequest" },
      ],
    },

    async run(context, input) {
      const collected = await context.turn(() => context.model.collect({ input }));

      // Check if collection was stopped due to abort
      if (collected.stopReason === "aborted") {
        return { message: collected.text, route: "stop" };
      }

      // If the model called tools, route to execute to handle them
      if (collected.toolCalls.length > 0) {
        return { message: collected.text.trim() || "Executing tools.", route: "execute", yield: { toolResults: [] } };
      }

      // Try to parse JSON routing from the response (for models that still output JSON)
      let message = collected.text.trim() || "Done.";
      let route = "stop";
      try {
        const parsed = JSON.parse(collected.text);
        if (isRecord(parsed) && typeof parsed.route === "string") {
          route = parsed.route === "direct" ? "stop" : parsed.route;
          message = (typeof parsed.message === "string" && parsed.message.trim()) || message;
        }
      } catch {
        // Plain text response — use as-is, route to stop
      }

      // Validate route
      const availablePhaseIds = new Set(context.availablePhases.map((p) => p.id));
      if (route !== "stop" && (!availablePhaseIds.has(route) || route === "chat")) {
        route = "stop";
      }

      return { message, route };
    },
  });
});
