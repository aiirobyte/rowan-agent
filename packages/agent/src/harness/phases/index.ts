export type {
  PhaseFrontmatter,
  Phase,
  PhaseRegistry,
} from "./types";

export type {
  ChatParams,
  ChatResult,
  LoopOptions,
  LoopState,
  LoopResult,
  AgentContext,
  ExtensionAPI,
} from "./extension-api";

export { loadPhase, loadPhases, reloadPhases } from "./loader";

export { createExtensionAPI } from "./extension-api-impl";
export type { ExtensionAPIContext, ModelClient, ExtensionAPIInternals } from "./extension-api-impl";
