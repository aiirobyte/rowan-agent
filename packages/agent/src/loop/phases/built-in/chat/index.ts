import { createId } from "../../../../types";
import type { PhaseInput, PhaseOutput, PhaseContext } from "../../config";
import { createPhaseDefinition, type PhaseHandler } from "../types";
import { toJson, serializeTools } from "../../../../harness/context/prompt-builder";
import manifestJson from "./manifest.json";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function runChatPhase(
  context: PhaseContext,
  input: PhaseInput,
): Promise<PhaseOutput> {
  const collected = await context.turn(() => context.model.collect({
    phase: "chat",
    input,
  }));

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
    const userMessages = input.messages.filter((m) => m.role === "user" && m.metadata?.scope === "conversation");
    const latestUserMsg = userMessages[userMessages.length - 1];
    return [
      "Phase: chat",
      "",
      "Answer the user's question directly in natural language.",
      "If the request requires tool access, call the available tools.",
      "Do NOT output JSON. Respond in the user's language.",
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
