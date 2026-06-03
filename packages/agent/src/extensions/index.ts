// Hook-based API
export { HooksManager, getGlobalHooks, resetGlobalHooks } from "./hooks";
export type {
  HookEvent,
  HookEventType,
  HookHandler,
  HookResultMap,
  HookError,
  // Event types
  BeforePhaseEvent,
  AfterPhaseEvent,
  BeforePromptEvent,
  BeforeToolCallEvent,
  AfterToolCallEvent,
  AgentStartEvent,
  AgentEndEvent,
  TurnStartEvent,
  TurnEndEvent,
  MessageStartEvent,
  MessageUpdateEvent,
  MessageEndEvent,
  ToolExecutionStartEvent,
  ToolExecutionUpdateEvent,
  ToolExecutionEndEvent,
  QueueUpdateEvent,
  SavePointEvent,
  AbortEvent,
  SettledEvent,
  // Result types
  BeforePhaseResult,
  AfterPhaseResult,
  BeforePromptResult,
  BeforeToolCallResult,
  AfterToolCallResult,
} from "./hooks";

// Context API
export { defineExtension } from "./context";
export type {
  ExtensionContext,
  ExtensionFactory,
  ExtensionUtils,
  ExtensionManifest,
  LoadedExtension,
} from "./context";

// Runner
export { ExtensionRunner, createExtensionRunner } from "./runner";
export type { ExtensionRunnerOptions } from "./runner";

// Builtin extensions
export {
  getBuiltinExtensions,
  getBuiltinRunner,
  createBuiltinPhaseRegistry,
  createDefaultPhaseRegistry,
  isBuiltinPhaseOverride,
  isBuiltinSource,
  type CreateDefaultPhaseRegistryOptions,
} from "./builtin";

// Loader
export {
  discoverAndLoadExtensions,
  loadExtensionFromFactory,
  loadExtensionFromFactorySync,
  loadExtensions,
} from "./loader";

// Types
export type {
  ExecOptions,
  ExecResult,
  ExtensionPackageManifest,
  PhaseManifest,
  PhaseRegistration,
  RegisteredPhase,
} from "./types";
