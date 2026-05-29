import {
  createAgentPhaseConfig,
  definePhasePlugin,
  type AgentPhaseConfig,
  type AgentPhasePlugin,
} from "../config";
import { ExtensionRunner } from "../../extensions";
import type { PhaseHandler } from "./types";
import type { PhaseDefinition } from "../config";
import { chatExtension } from "./chat";
import { planExtension } from "./plan";
import { executeExtension } from "./execute";
import { verifyExtension } from "./verify";

// ---------------------------------------------------------------------------
// Extension runner — loads all built-in phase extensions
// ---------------------------------------------------------------------------

const runner = new ExtensionRunner();
runner.loadSync([chatExtension, planExtension, executeExtension, verifyExtension]);

// ---------------------------------------------------------------------------
// Backward-compatible API — delegates to the runner
// ---------------------------------------------------------------------------

/** Get phase definition by id (resolves via extension runner). */
export function getPhase(id: string): PhaseDefinition | undefined {
  return runner.getPhase(id);
}

/** Get all registered phase definitions. */
export function getPhases(): PhaseDefinition[] {
  return runner.getPhases();
}

/** Get handler by id — wraps ExtensionPhaseHandler into legacy PhaseHandler shape. */
export function getPhaseHandler(phaseId: string): PhaseHandler | undefined {
  const handler = runner.getHandler(phaseId);
  const definition = runner.getPhase(phaseId);
  if (!handler || !definition) return undefined;
  return { ...handler, definition };
}

/** Get all handlers in legacy PhaseHandler shape. */
export function getBuiltinHandlers(): PhaseHandler[] {
  return runner.getPhases().map((p) => {
    const handler = runner.getHandler(p.id)!;
    return { ...handler, definition: p };
  });
}

/** Access the extension runner directly. */
export function getRunner(): ExtensionRunner {
  return runner;
}

// ---------------------------------------------------------------------------
// Phase definitions — re-export for barrel consumers
// ---------------------------------------------------------------------------

export const chatPhaseDefinition = (): PhaseDefinition | undefined => runner.getPhase("chat");
export const planPhaseDefinition = (): PhaseDefinition | undefined => runner.getPhase("plan");
export const executePhaseDefinition = (): PhaseDefinition | undefined => runner.getPhase("execute");
export const verifyPhaseDefinition = (): PhaseDefinition | undefined => runner.getPhase("verify");

// ---------------------------------------------------------------------------
// Config factory
// ---------------------------------------------------------------------------

export function createBuiltinPhasePlugin(): AgentPhasePlugin {
  const phases = runner.getPhases();
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

// ---------------------------------------------------------------------------
// Re-export extensions API for convenience
// ---------------------------------------------------------------------------

export { chatExtension } from "./chat";
export { planExtension } from "./plan";
export { executeExtension } from "./execute";
export { verifyExtension } from "./verify";
