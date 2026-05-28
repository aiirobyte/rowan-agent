import type { Outcome } from "../../../protocol";
import type { PhaseContext, PhaseDefinition, PhaseInput, PhaseOutput } from "../config";

export type PhaseManifest = {
  id: string;
  name: string;
  description: string;
};

export function createPhaseDefinition(
  manifest: PhaseManifest,
  run: PhaseDefinition["run"],
): PhaseDefinition {
  return {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    run,
  };
}

export type PhaseHandler = {
  definition: PhaseDefinition;
  conversationLimit?: number;
  prepare?(context: PhaseContext): void;
  buildInput(context: PhaseContext, yield_?: unknown): PhaseInput | Promise<PhaseInput>;
  buildPrompt?(input: PhaseInput): string;
  finalize?(context: PhaseContext, output: PhaseOutput): void | Promise<void>;
  createOutcome?(output: PhaseOutput): Outcome;
};