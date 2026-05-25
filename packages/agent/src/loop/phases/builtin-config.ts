import chatManifest from "./builtin-phases/chat/manifest.json";
import executeManifest from "./builtin-phases/execute/manifest.json";
import planManifest from "./builtin-phases/plan/manifest.json";
import verifyManifest from "./builtin-phases/verify/manifest.json";
import { chatPhaseImplementation } from "./builtin-phases/chat";
import { executePhaseImplementation } from "./builtin-phases/execute";
import { planPhaseImplementation } from "./builtin-phases/plan";
import { verifyPhaseImplementation } from "./builtin-phases/verify";
import {
  createAgentPhaseConfig,
  definePhasePlugin,
  type AgentPhaseConfig,
  type AgentPhasePlugin,
  type PhaseConfigTemplate,
  type PhaseConfigTemplatePhase,
  type PhaseDefinition,
  type PhaseImplementation,
} from "./config";

export const builtinPhaseConfigTemplate: PhaseConfigTemplate = {
  id: "builtin",
  entryPhaseId: "chat",
  phases: [
    chatManifest,
    planManifest,
    executeManifest,
    verifyManifest,
  ] as PhaseConfigTemplatePhase[],
};

export const configTemplate = builtinPhaseConfigTemplate;

export const builtinPhaseImplementations: Record<string, PhaseImplementation<any, any>> = {
  chat: chatPhaseImplementation,
  plan: planPhaseImplementation,
  execute: executePhaseImplementation,
  verify: verifyPhaseImplementation,
};

export function createPhaseDefinitionsFromTemplate(
  template: PhaseConfigTemplate = builtinPhaseConfigTemplate,
  implementations: Record<string, PhaseImplementation<any, any>> = builtinPhaseImplementations,
): PhaseDefinition<any, any>[] {
  return template.phases.map((phase) => {
    const implementation = implementations[phase.implementationId];
    if (!implementation) {
      throw new Error(`No phase implementation registered for "${phase.implementationId}".`);
    }

    return {
      id: phase.id,
      name: phase.name,
      description: phase.description,
      modelPhase: phase.modelPhase,
      ...implementation,
    };
  });
}

export function createPhasePluginFromTemplate(
  template: PhaseConfigTemplate = builtinPhaseConfigTemplate,
  implementations: Record<string, PhaseImplementation<any, any>> = builtinPhaseImplementations,
): AgentPhasePlugin {
  return definePhasePlugin({
    id: template.id,
    entryPhaseId: template.entryPhaseId,
    phases: createPhaseDefinitionsFromTemplate(template, implementations),
  });
}

export function createPhaseConfigFromTemplate(
  template: PhaseConfigTemplate = builtinPhaseConfigTemplate,
  implementations: Record<string, PhaseImplementation<any, any>> = builtinPhaseImplementations,
): AgentPhaseConfig {
  return createAgentPhaseConfig({
    plugins: [createPhasePluginFromTemplate(template, implementations)],
  });
}

export function createBuiltinPhasePlugin(): AgentPhasePlugin {
  return createPhasePluginFromTemplate(builtinPhaseConfigTemplate);
}

export function createBuiltinPhaseConfig(): AgentPhaseConfig {
  return createPhaseConfigFromTemplate(builtinPhaseConfigTemplate);
}

export const chatPhaseDefinition = createPhaseDefinitionsFromTemplate()[0];
export const planPhaseDefinition = createPhaseDefinitionsFromTemplate()[1];
export const executePhaseDefinition = createPhaseDefinitionsFromTemplate()[2];
export const verifyPhaseDefinition = createPhaseDefinitionsFromTemplate()[3];
