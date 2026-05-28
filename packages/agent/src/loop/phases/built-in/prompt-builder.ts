import type { PhasePromptBuilder } from "../../../harness/context/prompt-builder";
import { createPromptBuilder } from "../../../harness/context/prompt-builder";
import type { PhaseHandler } from "./types";
import { getBuiltinHandlers } from ".";

export function createPhasePromptBuilder(handler: PhaseHandler): PhasePromptBuilder {
  return {
    phase: handler.definition.id,
    conversationLimit: handler.conversationLimit,
    build({ input, tools }) {
      if (!handler.buildPrompt) {
        throw new Error(`Phase "${handler.definition.id}" does not have a buildPrompt method.`);
      }
      return handler.buildPrompt({
        ...input,
        tools: tools as any,
      });
    },
  };
}

export function createPhasePromptBuilders(
  handlers?: PhaseHandler[],
): PhasePromptBuilder[] {
  const source = handlers ?? getBuiltinHandlers();
  return source
    .filter((h): h is PhaseHandler & { buildPrompt: NonNullable<typeof h.buildPrompt> } => h.buildPrompt !== undefined)
    .map((h) => createPhasePromptBuilder(h));
}

export const builtinPhasePromptBuilders = createPhasePromptBuilders();

export function createBuiltinPromptBuilder(
  handlers?: PhaseHandler[],
) {
  return createPromptBuilder(createPhasePromptBuilders(handlers));
}

const builtinPromptBuilder = createBuiltinPromptBuilder();

export const buildPrompt = builtinPromptBuilder.buildPrompt;
export const buildMessages = builtinPromptBuilder.buildMessages;
