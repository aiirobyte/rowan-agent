export { builtinPhases } from "./built-in";
export {
  createPhaseRegistry,
  definePhase,
  resolvePhaseEntry,
  ensurePhaseRegistry,
  DEFAULT_PHASE_ID,
  type PhaseRegistry,
  type PhaseRegistryInput,
  type PhaseManifest,
  type PhaseContext,
  type PhaseDefinition,
  type PhaseInput,
  type PhaseOutput,
  type PhaseRun,
  type ToolCall,
  type ModelInvokeOutput,
  type ModelInvokeInput,
  type MessageSnapshot,
  type PhaseMessageManager,
  type PhaseToolExecutionManager,
} from "./registry";

// Extension types (new API)
export {
  ExtensionRunner,
  createExtensionRunner,
  loadExtensionFromFactory,
  loadExtensionFromFactorySync,
} from "../../extensions";
export type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionFactory,
} from "../../extensions";
