import {
  createAgentPhaseConfig,
  definePhasePlugin,
  type AgentPhaseConfig,
  type AgentPhasePlugin,
} from "../config";
import type { PhaseHandler } from "./types";
import { chatHandler } from "./chat";
import { planHandler } from "./plan";
import { executeHandler } from "./execute";
import { verifyHandler } from "./verify";

// ============================================================================
// Handler Registry
// ============================================================================

const handlers: Record<string, PhaseHandler> = {
  chat: chatHandler,
  plan: planHandler,
  execute: executeHandler,
  verify: verifyHandler,
};

// ============================================================================
// Phase Definitions
// ============================================================================

export const chatPhaseDefinition = chatHandler.definition;
export const planPhaseDefinition = planHandler.definition;
export const executePhaseDefinition = executeHandler.definition;
export const verifyPhaseDefinition = verifyHandler.definition;

// ============================================================================
// Handler Access
// ============================================================================

export function getPhaseHandler(phaseId: string): PhaseHandler | undefined {
  return handlers[phaseId];
}

export function getBuiltinHandlers(): PhaseHandler[] {
  return Object.values(handlers);
}

// ============================================================================
// Config Factory
// ============================================================================

export function createBuiltinPhasePlugin(): AgentPhasePlugin {
  const phases = Object.values(handlers).map((h) => h.definition);
  return definePhasePlugin({
    id: "builtin",
    entryPhaseId: "chat",
    phases,
  });
}

export function createBuiltinPhaseConfig(): AgentPhaseConfig {
  return createAgentPhaseConfig({
    plugins: [createBuiltinPhasePlugin()],
  });
}

export { chatHandler, planHandler, executeHandler, verifyHandler };