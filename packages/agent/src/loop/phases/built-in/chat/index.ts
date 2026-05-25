import { appendAssistantMessage } from "../../../../agent-loop";
import { createId, createMessage, Validators } from "../../../../types";
import type { Outcome, PhaseOutput } from "../../../../types";
import { runtimeDepth } from "../../../state";
import type { ChatInput } from "../../../types";
import type { PhaseContext } from "../../config";
import type { BuiltinPhaseExtension } from "../types";
import manifestJson from "./manifest.json";
import type { PhaseConfigTemplatePhase } from "../../config";

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

const manifest = manifestJson as PhaseConfigTemplatePhase;

export const chatExtension: BuiltinPhaseExtension<ChatInput, PhaseOutput> = {
  manifest,

  definition: {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    modelPhase: manifest.modelPhase,
    async run(context, input) {
      return runChatPhase(context, input);
    },
  },

  buildInput(runtime) {
    const phaseConfig = runtime.phaseConfig;
    const availablePhases = (phaseConfig?.phases ?? [])
      .filter((phase) => phase.id !== "chat")
      .map((phase) => ({
        id: phase.id,
        name: phase.name,
        description: phase.description,
      }));

    return {
      state: runtime.agentState,
      runtime: runtimeDepth(runtime),
      tools: runtime.tools,
      availablePhases,
      workerTask: runtime.threadDepth > 0 ? runtime.agentState.task : undefined,
      workerGoal: runtime.threadDepth > 0 ? runtime.agentState.goal : undefined,
    };
  },

  async applyOutput({ runtime, phaseOutput: output }) {
    if (output.route === "direct") {
      const outcome = createDirectOutcome(output.message);
      await appendAssistantMessage(runtime, outcome.message, {
        kind: "direct_answer",
        scope: "conversation",
      });
      return { type: "stop", outcome };
    }

    return { type: "next", phaseId: output.route };
  },
};

export type { ChatInput } from "../../../types";
