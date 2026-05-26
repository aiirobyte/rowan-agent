import type { LlmContext } from "../../../protocol";
import type { PromptTool } from "../../../harness/context/prompt-builder";
import type { PhaseContext, PhaseDefinition, PhaseTransition } from "../config";

export type PhaseManifest = {
  id: string;
  name: string;
  description: string;
};

export function createPhaseDefinition<TInput, TOutput>(
  manifest: PhaseManifest,
  run: PhaseDefinition<TInput, TOutput>["run"],
): PhaseDefinition<TInput, TOutput> {
  return {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    run,
  };
}

export type PhaseHandler<TInput = unknown, TOutput = unknown> = {
  definition: PhaseDefinition<TInput, TOutput>;
  conversationLimit?: number;
  prepare?(context: PhaseContext): void;
  buildInput(context: PhaseContext): TInput | Promise<TInput>;
  buildPrompt?(context: LlmContext, tools: PromptTool[]): string;
  finalize?(context: PhaseContext, output: TOutput): void;
  applyOutput(
    context: PhaseContext,
    input: TInput,
    output: TOutput,
  ): PhaseTransition | Promise<PhaseTransition>;
};