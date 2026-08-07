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
 *   api.on("before_tool_call", (event) => {
 *     return { allow: true };
 *   });
 *
 *   await api.registerPhase("./phase");
 * }
 * ```
 */

// Unified API for extension
export type {
  ExtensionAPI,
  ExtensionDisposer,
  ExtensionFactory,
  ExtensionFactoryResult,
} from "./api";
export { createExtensionAPI } from "./api";
export type {
  ExtensionContext,
  ExtensionManifest,
  ExtensionUtils,
  LoadedExtension,
} from "./context";

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
} from "./hooks";

// Runner
export { ExtensionRunner, createExtensionRunner } from "./runner";
export type { ExtensionRunnerOptions } from "./runner";

// EventBus
export { createEventBus } from "./event-bus";
export type { EventBus } from "./event-bus";

// Source info
export { createSourceInfo } from "./types";
export type { SourceInfo } from "./types";

// Types
export type {
  ExecOptions,
  ExecResult,
  ExtensionPackageManifest,
  PhaseRegistration,
  PhaseRun,
  PhaseDefinition,
  RegisteredPhase,
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
