/**
 * @module extensions
 *
 * Unified extension system — re-exports all extension APIs, hooks, runner,
 * loader, and built-in helpers.
 *
 * Extension typically only need the types from `./context`:
 *
 * ```typescript
 * import type { ExtensionAPI } from "@rowan-agent/agent";
 *
 * export default function(api: ExtensionAPI) {
 *   api.hooks.on("before_tool_call", (event) => {
 *     return { allow: true };
 *   });
 *
 *   await api.phases.register("./phase");
 * }
 * ```
 */

// Unified API for extension
export type {
  ExtensionAPI,
  ExtensionAgentsAPI,
  ExtensionAgentConsumerDisposer,
  ExtensionDisposer,
  ExtensionFactory,
  ExtensionFactoryResult,
  PhaseRunHandler,
  ExtensionAgentsRuntimeDelegate,
} from "./api";
export { createExtensionAPI } from "./api";
export type {
  ExtensionContext,
  ExtensionManifest,
  LoadedExtension,
} from "./context";
export type { ExecOptions, ExecResult } from "./types";

// Hook-based API
export { HooksManager } from "./hooks";
export type {
  HookEvent,
  HookEventType,
  HookHandler,
  HookResultMap,
  HookError,
  BeforePhaseEvent,
  AfterPhaseEvent,
  BeforePromptEvent,
  BeforeToolCallEvent,
  AfterToolCallEvent,
  BeforePhaseResult,
  AfterPhaseResult,
  BeforePromptResult,
  BeforeToolCallResult,
  AfterToolCallResult,
  RunStartEvent,
  RunEndEvent,
} from "./hooks";

// Host
export { InMemoryExtensionHost, scopeToKey } from "./host";

// Runner
export { ExtensionRunner, createExtensionRunner, extensionSourceId } from "./runner";
export type { ExtensionRunnerOptions } from "./runner";

// EventBus
export { createEventBus } from "./event-bus";
export type { EventBus } from "./event-bus";

// Source info
export { createSourceInfo } from "./types";
export type { SourceInfo } from "./types";

// Types
export type {
  ExtensionPackageManifest,
  ExtensionCapability,
  ExtensionCapabilityContribution,
  ExtensionToolContribution,
  ExtensionHost,
  HostApiExtension,
  ExtensionStateStore,
  PhaseRegistration,
  PhaseRun,
  PhaseDefinition,
  RegisteredPhase,
  SkillRegistration,
  RegisteredSkill,
  ScopeRef,
  ToolDefinition,
  ToolExecutionResult,
  RegisteredTool,
  ExtensionError,
  ExtensionErrorListener,
  Extension,
  ExtensionRuntime,
  LoadExtensionsResult,
} from "./types";
export { createExtensionRuntime } from "./types";
