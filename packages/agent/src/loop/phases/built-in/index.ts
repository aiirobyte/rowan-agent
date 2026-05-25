import {
  createAgentPhaseConfig,
  definePhasePlugin,
  type AgentPhaseConfig,
  type AgentPhasePlugin,
  type PhaseConfigTemplate,
  type PhaseConfigTemplatePhase,
  type PhaseDefinition,
} from "../config";
import type { BuiltinPhaseExtension } from "./types";
import { chatExtension } from "./chat";
import { planExtension } from "./plan";
import { executeExtension } from "./execute";
import { verifyExtension } from "./verify";

// ============================================================================
// Extension Registry
// ============================================================================

const extensions: Record<string, BuiltinPhaseExtension<any, any>> = {
  chat: chatExtension,
  plan: planExtension,
  execute: executeExtension,
  verify: verifyExtension,
};

// ============================================================================
// Config Template (backward compat)
// ============================================================================

export const builtinPhaseConfigTemplate: PhaseConfigTemplate = {
  id: "builtin",
  entryPhaseId: "chat",
  phases: Object.values(extensions).map((ext) => ext.manifest),
};

export const configTemplate = builtinPhaseConfigTemplate;

// ============================================================================
// Phase Definitions (backward compat)
// ============================================================================

export const chatPhaseDefinition = chatExtension.definition;
export const planPhaseDefinition = planExtension.definition;
export const executePhaseDefinition = executeExtension.definition;
export const verifyPhaseDefinition = verifyExtension.definition;

// ============================================================================
// Extension Access
// ============================================================================

export function getBuiltinExtension(phaseId: string): BuiltinPhaseExtension<any, any> | undefined {
  return extensions[phaseId];
}

// ============================================================================
// Config Factory
// ============================================================================

export function createBuiltinPhasePlugin(): AgentPhasePlugin {
  const phases = Object.values(extensions).map((ext) => ext.definition);
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

// ============================================================================
// Template Helpers (backward compat)
// ============================================================================

export function createPhaseDefinitionsFromTemplate(
  template: PhaseConfigTemplate = builtinPhaseConfigTemplate,
  implementationOverrides?: Record<string, BuiltinPhaseExtension<any, any>>,
): PhaseDefinition<any, any>[] {
  const exts = implementationOverrides ?? extensions;
  return template.phases.map((phase) => {
    const ext = exts[phase.implementationId];
    if (!ext) {
      throw new Error(`No phase extension registered for "${phase.implementationId}".`);
    }
    return ext.definition;
  });
}

export function createPhasePluginFromTemplate(
  template: PhaseConfigTemplate = builtinPhaseConfigTemplate,
  implementationOverrides?: Record<string, BuiltinPhaseExtension<any, any>>,
): AgentPhasePlugin {
  return definePhasePlugin({
    id: template.id,
    entryPhaseId: template.entryPhaseId,
    phases: createPhaseDefinitionsFromTemplate(template, implementationOverrides),
  });
}

export function createPhaseConfigFromTemplate(
  template: PhaseConfigTemplate = builtinPhaseConfigTemplate,
  implementationOverrides?: Record<string, BuiltinPhaseExtension<any, any>>,
): AgentPhaseConfig {
  return createAgentPhaseConfig({
    plugins: [createPhasePluginFromTemplate(template, implementationOverrides)],
  });
}

export { chatExtension, planExtension, executeExtension, verifyExtension };
