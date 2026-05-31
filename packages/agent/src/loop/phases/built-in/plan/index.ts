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
    conversationLimit: 20,

    async run(context, input) {
      const collected = await context.turn(() => context.model.collect({
        phase: "plan",
        input,
      }));

      // Plan phase still uses JSON for structured task data
      let raw: Record<string, unknown> | undefined;
      try {
        raw = JSON.parse(collected.text) as Record<string, unknown>;
      } catch {
        throw new Error("Planner did not produce valid JSON.");
      }

      const rawTask = raw?.task ?? raw;
      if (!rawTask) {
        throw new Error("Planner did not produce a structured task.");
      }

      const task = normalizeTask(rawTask);
      const message = (raw?.message as string) ?? "";

      return {
        message,
        route: "execute",
        yield: { task },
      };
    },

    buildInput(context) {
      return {
        phase: "plan",
        systemPrompt: context.state.agentState.systemPrompt,
        messages: context.messages.visible(),
        tools: [],
        skills: context.skills,
      };
    },

    buildPrompt(input) {
      return [
        "Phase: plan",
        "",
        "Analyze the user's request and create a task plan.",
        'Output a JSON object: { "task": { ... }, "message": "explanation" }',
        "Task fields: title, instruction, acceptanceCriteria, toolNames, skillIds, status, attempts.",
        'Prefer setting task.status to "pending" and task.attempts to 0.',
        "Use toolNames only from the available tools. Use skillIds only from the loaded skills.",
        "",
        "Current user request:",
        rowan.format.json(rowan.input.latestUserMessage(input)),
        "",
        "Available tools with name, description, and parameters:",
        rowan.format.json(rowan.format.tools(input.tools)),
      ].join("\n");
    },
  });
});
