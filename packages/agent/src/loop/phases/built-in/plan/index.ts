import { defineExtension } from "../../../../extensions/types";
import packageJson from "./package.json";

const manifestJson = packageJson.rowan.phase;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeTask(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("Expected task to be an object.");
  const status = value.status;
  if (status !== "pending" && status !== "running" && status !== "passed" && status !== "failed") {
    throw new Error("Expected task status to be pending, running, passed, or failed.");
  }
  return {
    id: typeof value.id === "string" ? value.id : "",
    title: typeof value.title === "string" ? value.title : "",
    instruction: typeof value.instruction === "string" ? value.instruction : "",
    acceptanceCriteria: Array.isArray(value.acceptanceCriteria)
      ? value.acceptanceCriteria.map((c: unknown) =>
          typeof c === "string" ? c
          : isRecord(c) && typeof c.description === "string" ? c.description
          : String(c)
        )
      : [],
    toolNames: Array.isArray(value.toolNames) ? value.toolNames.filter((t: unknown) => typeof t === "string") : [],
    skillIds: Array.isArray(value.skillIds) ? value.skillIds.filter((s: unknown) => typeof s === "string") : [],
    status,
    attempts: typeof value.attempts === "number" ? value.attempts : 0,
  };
}

export const planPhaseExtension = defineExtension((rowan) => {
  rowan.registerPhase({
    ...manifestJson,

    prompt: {
      instructions: [
        "Phase: plan",
        "",
        "Analyze the user's request and create a task plan.",
        'Output a JSON object: { "task": { ... }, "message": "explanation" }',
        "Task fields: title, instruction, acceptanceCriteria, toolNames, skillIds, status, attempts.",
        'Prefer setting task.status to "pending" and task.attempts to 0.',
        "Use toolNames only from the available tools. Use skillIds only from the loaded skills.",
        "After outputting the task JSON, call the 'route' tool to indicate the next phase.",
      ],
    },

    async run(context, input) {
      const collected = await context.turn(() => context.model.collect({ input }));

      // Plan phase uses JSON for structured task data
      let raw: Record<string, unknown> | undefined;
      try {
        raw = JSON.parse(collected.text) as Record<string, unknown>;
      } catch {
        // If no valid JSON, check for route tool call and return empty task
        const routeDecision = context.routeDecision(collected.toolCalls);
        if (routeDecision) {
          return {
            message: routeDecision.reason ?? "",
            route: routeDecision.route,
            yield: { task: null },
          };
        }
        throw new Error("Planner did not produce valid JSON.");
      }

      const rawTask = raw?.task ?? raw;
      if (!rawTask) {
        throw new Error("Planner did not produce a structured task.");
      }

      const task = normalizeTask(rawTask);
      const message = (raw?.message as string) ?? "";

      // Check for route tool call
      const routeDecision = context.routeDecision(collected.toolCalls);
      if (routeDecision) {
        return {
          message: routeDecision.reason ?? message,
          route: routeDecision.route,
          yield: { task },
        };
      }

      // Default: no route tool call, but task was produced
      // The model should have called route tool, but if not, default to stop
      return {
        message,
        route: "stop",
        yield: { task },
      };
    },
  });
});
