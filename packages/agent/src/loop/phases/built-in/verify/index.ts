import { defineExtension } from "../../../../extensions/types";
import packageJson from "./package.json";

const manifestJson = packageJson.rowan.phase;

export const verifyPhaseExtension = defineExtension((rowan) => {
  rowan.registerPhase({
    ...manifestJson,

    prompt: {
      sections: [
        { type: "instructions", lines: [
          "Phase: verify",
          "",
          "Review the task output against the acceptance criteria.",
          "If the criteria are met, respond with a confirmation.",
          "If more work is needed, call tools to fix issues.",
          "Do NOT output JSON.",
        ]},
        { type: "task" },
        { type: "taskOutput" },
      ],
    },

    async run(context, input) {
      const maxAttempts = context.maxAttempts ?? 2;
      const task = (input.yield as Record<string, unknown> | undefined)?.task;

      let collected;
      try {
        collected = await context.turn(() => context.model.collect({ input }));
      } catch (error) {
        if (context.state.attempt >= maxAttempts) {
          return {
            message: "Verification error, no retries remaining.",
            route: "stop",
            yield: { task },
          };
        }
        return {
          message: "Verification error, retrying.",
          route: "execute",
          yield: { task },
        };
      }

      // If model called tools, route to execute for rework
      if (collected.toolCalls.length > 0) {
        if (context.state.attempt >= maxAttempts) {
          return { message: collected.text || "Verification fix attempted.", route: "stop", yield: { task } };
        }
        return { message: collected.text || "Fixing issues.", route: "execute", yield: { task } };
      }

      // Try to parse JSON routing (for models that output structured verify results)
      let message = collected.text.trim();
      let passed = !/fail|error|issue|fix|retry/i.test(message);
      let route = passed ? "stop" : "execute";

      try {
        const parsed = JSON.parse(collected.text);
        if (parsed && typeof parsed === "object") {
          if (typeof parsed.passed === "boolean") passed = parsed.passed;
          if (typeof parsed.message === "string" && parsed.message.trim()) message = parsed.message.trim();
          if (typeof parsed.route === "string") route = parsed.route;
        }
      } catch {
        // Plain text — use heuristic above
      }

      if (route === "execute" && context.state.attempt >= maxAttempts) {
        route = "stop";
      }

      return { message, route, yield: { task } };
    },
  });
});
