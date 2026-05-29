import type { Outcome, PhaseContext, PhaseDefinition, PhaseInput, PhaseOutput } from "../config";

// Backward-compatible type alias — ExtensionPhaseHandler is the canonical form
export type PhaseHandler = {
  definition: PhaseDefinition;
  conversationLimit?: number;
  prepare?(context: PhaseContext): void;
  buildInput(context: PhaseContext, yield_?: unknown): PhaseInput | Promise<PhaseInput>;
  buildPrompt?(input: PhaseInput): string;
  finalize?(context: PhaseContext, output: PhaseOutput): void | Promise<void>;
  createOutcome?(output: PhaseOutput): Outcome;
};
