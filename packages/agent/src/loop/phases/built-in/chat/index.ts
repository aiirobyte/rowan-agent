import { createId, createMessage, Validators } from "../../../../types";
import type { Outcome, PhaseOutput } from "../../../../types";
import type { LlmContext } from "../../../../protocol";
import type { ChatInput } from "../../../types";
import type { PhaseContext } from "../../config";
import { createPhaseDefinition, type PhaseHandler } from "../types";
import type { PromptTool } from "../../../../harness/context/prompt-builder";
import { toJson, latestUserInput, serializeSkills, serializeTools } from "../../../../harness/context/prompt-builder";
import manifestJson from "./manifest.json";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function createDirectOutcome(message: string): Outcome {
  return Validators.outcome.Parse({
    id: createId("out"),
    passed: true,
    message,
  });
}

export function parseChatOutput(value: unknown, input: ChatInput): PhaseOutput {
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
    (route === "direct" ? "Done." : "Creating a task for this request.");
  const text = asNonEmptyString(value.text) ?? message;

  const availablePhaseIds = new Set((input.availablePhases ?? []).map((phase) => phase.id));
  if (route !== "direct" && (!availablePhaseIds.has(route) || route === "chat")) {
    throw new Error(`Chat phase routed to unavailable phase "${route}".`);
  }

  return { route, message, text };
}

export async function runChatPhase(
  context: PhaseContext,
  input: ChatInput,
): Promise<PhaseOutput> {
  const collected = await context.model.collect({
    phase: "chat",
    payload: {
      phase: "chat",
      state: input.state,
      runtime: input.runtime,
      availablePhases: input.availablePhases,
    },
    recordText: false,
  });

  const rawOutput = collected.phaseOutput ?? collected.structured;
  if (!rawOutput) {
    throw new Error("Chat phase did not produce a structured phase output.");
  }

  const output = parseChatOutput(rawOutput, input);
  if (output.route !== "direct") {
    await context.messages.append(
      createMessage("assistant", JSON.stringify(output), {
        kind: "phase_output",
        phase: "chat",
        scope: "execution",
      }),
    );
  }
  return output;
}

function requireChatContext(context: LlmContext): Extract<LlmContext, { phase: "chat" }> {
  if (context.phase !== "chat") {
    throw new Error(`Expected chat context, received ${context.phase}.`);
  }
  return context as Extract<LlmContext, { phase: "chat" }>;
}

export const chatHandler: PhaseHandler<ChatInput, PhaseOutput> = {
  definition: createPhaseDefinition(manifestJson, async (context, input) => {
    return runChatPhase(context, input);
  }),

  conversationLimit: 12,

  buildInput(context) {
    return {
      state: context.state.agentState,
      runtime: context.state.depth,
      tools: [],
      availablePhases: context.availablePhases.filter((p) => p.id !== "chat"),
      workerTask: context.state.depth.threadDepth > 0 ? context.state.agentState.task : undefined,
      workerGoal: context.state.depth.threadDepth > 0 ? context.state.agentState.goal : undefined,
    };
  },

  buildPrompt(context, tools) {
    const ctx = requireChatContext(context);
    const availablePhases = ctx.availablePhases ?? [];
    return [
      "Phase: chat",
      "",
      'JSON-only contract: output exactly an object shaped like `{ "message": string, "route": "direct" | string }`.',
      'Use route="direct" when you can fully answer the user without another loop phase.',
      "Use another route only when it matches one of the available phase ids below.",
      'When route="direct", message must be the complete final user-visible answer in the user\'s language.',
      "When route is another phase id, message is only a concise routing status.",
      "Do not call tools in this phase; only answer directly or choose the next phase.",
      "If the user asks about the current workspace, repository, files, tools, or commands, route to an available tool-backed phase instead of guessing.",
      "If Agent state task or Agent state goal is present, this is a worker thread; prioritize that task/goal over broad delegation.",
      "Route only the current user request below. Use prior conversation only as context.",
      "",
      "Current user request:",
      toJson(latestUserInput(ctx)),
      "",
      "Agent state initial input:",
      toJson(ctx.state.input),
      "",
      "Agent state task:",
      toJson(ctx.state.task ?? null),
      "",
      "Agent state goal:",
      toJson(ctx.state.goal ?? null),
      "",
      "Runtime thread depth:",
      toJson(ctx.runtime ?? null),
      "",
      "Available phases:",
      toJson(availablePhases),
      "",
      "Loaded skills summary:",
      toJson(serializeSkills(ctx)),
      "",
      "Available tools with name, description, and parameters:",
      toJson(serializeTools(tools)),
    ].join("\n");
  },

  async applyOutput(context, _input, output) {
    if (output.route === "direct") {
      const outcome = createDirectOutcome(output.message);
      await context.messages.appendState(
        createMessage("assistant", outcome.message, {
          kind: "direct_answer",
          scope: "conversation",
        }),
      );
      return { type: "stop", outcome };
    }

    return { type: "next", phaseId: output.route };
  },
};

export type { ChatInput } from "../../../types";