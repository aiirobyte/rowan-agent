import { createId } from "../../../../types";
import type { PhaseInput, PhaseOutput, PhaseContext } from "../../config";
import { createPhaseDefinition, type PhaseHandler } from "../types";
import { toJson, serializeTools } from "../../../../harness/context/prompt-builder";
import manifestJson from "./manifest.json";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function parseChatOutput(value: unknown): { route: string; message: string } {
  if (!isRecord(value)) {
    throw new Error("Expected chat output to be an object.");
  }

  const route = asNonEmptyString(value.route);
  if (!route) {
    throw new Error("Expected chat output to include a non-empty route.");
  }

  const message =
    asNonEmptyString(value.message) ??
    asNonEmptyString(value.answer) ??
    asNonEmptyString(value.response) ??
    (route === "stop" ? "Done." : "Creating a task for this request.");

  return { route, message };
}

export async function runChatPhase(
  context: PhaseContext,
  input: PhaseInput,
): Promise<PhaseOutput> {
  const collected = await context.turn(() => context.model.collect({
    phase: "chat",
    input,
    recordText: false,
  }));

  const rawOutput = collected.structured;
  if (!rawOutput) {
    throw new Error("Chat phase did not produce a structured phase output.");
  }

  const { route: rawRoute, message } = parseChatOutput(rawOutput);

  // Normalize route: "direct" is an alias for "stop"
  const route = rawRoute === "direct" ? "stop" : rawRoute;

  // Validate route
  const availablePhaseIds = new Set(context.availablePhases.map((p) => p.id));
  if (route !== "stop" && (!availablePhaseIds.has(route) || route === "chat")) {
    throw new Error(`Chat phase routed to unavailable phase "${route}".`);
  }

  return { message, route };
}

export const chatHandler: PhaseHandler = {
  definition: createPhaseDefinition(manifestJson, async (context, input) => {
    return runChatPhase(context, input);
  }),

  conversationLimit: 12,

  buildInput(context) {
    return {
      phase: "chat",
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
      "Phase: chat",
      "",
      'JSON-only contract: output exactly an object shaped like `{ "message": string, "route": "stop" | string }`.',
      'Use route="stop" when you can fully answer the user without another loop phase.',
      "Use another route only when it matches one of the available phase ids below.",
      'When route="stop", message must be the complete final user-visible answer in the user\'s language.',
      "When route is another phase id, message is only a concise routing status.",
      "Do not call tools in this phase; only answer directly or choose the next phase.",
      "Route only the current user request below. Use prior conversation only as context.",
      "",
      "Current user request:",
      toJson(latestUserMsg?.content ?? ""),
      "",
      "Available tools with name, description, and parameters:",
      toJson(serializeTools(input.tools)),
    ].join("\n");
  },

  createOutcome(output) {
    return { id: createId("out"), passed: true, message: output.message };
  },
};
