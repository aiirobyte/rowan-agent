import type { Outcome, PhaseContext, PhaseDefinition, PhaseInput, PhaseOutput } from "../loop/phases/config";

// ---------------------------------------------------------------------------
// Phase manifest — describes a phase at registration time
// ---------------------------------------------------------------------------

export type PhaseManifest = { id: string; name: string; description: string };

// ---------------------------------------------------------------------------
// Extension phase handler — lifecycle methods for a registered phase
// ---------------------------------------------------------------------------

export type ExtensionPhaseHandler = {
  conversationLimit?: number;
  prepare?(context: PhaseContext): void;
  buildInput(context: PhaseContext, yield_?: unknown): PhaseInput | Promise<PhaseInput>;
  buildPrompt?(input: PhaseInput): string;
  finalize?(context: PhaseContext, output: PhaseOutput): void | Promise<void>;
  createOutcome?(output: PhaseOutput): Outcome;
};

// run is part of PhaseDefinition, not the handler — passed separately to registerPhase

// ---------------------------------------------------------------------------
// Extension API — passed to factory functions for registration
// ---------------------------------------------------------------------------

export type BeforePhaseHookContext = { phaseId: string };
export type AfterPhaseHookContext = { phaseId: string };

export type ExtensionAPI = {
  registerPhase(manifest: PhaseManifest, handler: ExtensionPhaseHandler, run: PhaseDefinition["run"]): void;
  beforePhase(hook: (ctx: BeforePhaseHookContext) => void | Promise<void>): void;
  afterPhase(hook: (ctx: AfterPhaseHookContext) => void | Promise<void>): void;
};

// ---------------------------------------------------------------------------
// Extension factory — the default export of an extension module
// ---------------------------------------------------------------------------

export type ExtensionFactory = (api: ExtensionAPI) => void | Promise<void>;
