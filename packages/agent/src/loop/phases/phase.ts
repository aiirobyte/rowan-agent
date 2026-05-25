import type { PhaseContext, PhaseDefinition } from "./config";

export {
  DEFAULT_PHASE_ID,
  createAgentPhaseConfig,
  createDefaultAgentPhaseConfig,
  definePhase,
  definePhasePlugin,
  resolvePhase,
  validatePhaseConfig,
  type AgentPhaseConfig,
  type AgentPhaseConfigInput,
  type AgentPhasePlugin,
  type PhaseContext,
  type PhaseDefinition,
  type PhaseTransition,
} from "./config";

export {
  builtinPhaseConfigTemplate,
  chatPhaseDefinition,
  configTemplate,
  createBuiltinPhaseConfig,
  createBuiltinPhasePlugin,
  executePhaseDefinition,
  getBuiltinExtension,
  planPhaseDefinition,
  verifyPhaseDefinition,
  chatExtension,
  planExtension,
  executeExtension,
  verifyExtension,
  createPhaseConfigFromTemplate,
  createPhaseDefinitionsFromTemplate,
  createPhasePluginFromTemplate,
} from "./built-in";
export type {
  PhaseConfigTemplate,
  PhaseConfigTemplatePhase,
} from "./config";
export type { BuiltinPhaseExtension } from "./built-in/types";

export async function runPhase<TInput, TOutput>(
  context: PhaseContext,
  definition: PhaseDefinition<TInput, TOutput>,
  input: TInput,
): Promise<TOutput> {
  return definition.run(context, input);
}
