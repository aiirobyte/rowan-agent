import type { PhaseInput } from "../../config";
import { createPhaseDefinition, type PhaseHandler } from "../types";
import { toJson, serializeTools } from "../../../../harness/context/prompt-builder";
import manifestJson from "./manifest.json";

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

export const planHandler: PhaseHandler = {
  definition: createPhaseDefinition(manifestJson, async (context, input) => {
    const collected = await context.turn(() => context.model.collect({
      phase: "plan",
      input,
    }));

    const raw = collected.structured as Record<string, unknown> | undefined;
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
  }),

  conversationLimit: 20,

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
    // Find the original user input, filtering out internal messages
    const userMessages = input.messages.filter((m) => m.role === "user" && m.metadata?.scope === "conversation");
    const latestUserMsg = userMessages[userMessages.length - 1];
    return [
      "Phase: plan",
      "",
      'JSON-only contract: output exactly an object shaped like `{ "message": string, "route": "execute", "task": Task }`.',
      "Task fields: title, instruction, acceptanceCriteria, toolNames, skillIds, status, attempts.",
      'Prefer setting task.status to "pending" and task.attempts to 0.',
      "Use toolNames only from the available tools. Use skillIds only from the loaded skills.",
      "Create the task for the current user request below.",
      "",
      "Current user request:",
      toJson(latestUserMsg?.content ?? ""),
      "",
      "Available tools with name, description, and parameters:",
      toJson(serializeTools(input.tools)),
    ].join("\n");
  },
};
