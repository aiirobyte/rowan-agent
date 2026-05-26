import type { PhasePromptBuilder } from "../../../harness/context/prompt-builder";
import { createPromptBuilder } from "../../../harness/context/prompt-builder";
import type { PhaseHandler } from "./types";
import { getBuiltinHandlers } from ".";

export function createPhasePromptBuilder(handler: PhaseHandler<any, any>): PhasePromptBuilder {
  return {
    phase: handler.definition.id as PhasePromptBuilder["phase"],
    conversationLimit: handler.conversationLimit,
    build({ context, tools }) {
      if (!handler.buildPrompt) {
        throw new Error(`Phase "${handler.definition.id}" does not have a buildPrompt method.`);
      }
      return handler.buildPrompt(context, tools);
    },
  };
}

export function createPhasePromptBuilders(
  handlers?: PhaseHandler<any, any>[],
): PhasePromptBuilder[] {
  const source = handlers ?? getBuiltinHandlers();
  return source
    .filter((h): h is PhaseHandler<any, any> & { buildPrompt: NonNullable<typeof h.buildPrompt> } => h.buildPrompt !== undefined)
    .map((h) => createPhasePromptBuilder(h));
}

export const builtinPhasePromptBuilders = createPhasePromptBuilders();

export function createBuiltinPromptBuilder(
  handlers?: PhaseHandler<any, any>[],
) {
  return createPromptBuilder(createPhasePromptBuilders(handlers));
}

const builtinPromptBuilder = createBuiltinPromptBuilder();

export const buildPrompt = builtinPromptBuilder.buildPrompt;
export const buildMessages = builtinPromptBuilder.buildMessages;