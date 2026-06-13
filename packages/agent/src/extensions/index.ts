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
 *   api.registerPhase({
 *     id: "review",
 *     name: "Code Review",
 *     run: async (context, input) => {
 *       return { message: "Done", route: "stop" };
 *     },
 *   });
 * }
 * ```
 */

// Unified API for extension
export type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionFactory,
  ExtensionManifest,
  ExtensionUtils,
  LoadedExtension,
} from "./context";

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

// Runner
export { ExtensionRunner, createExtensionRunner } from "./runner";
export type { ExtensionRunnerOptions } from "./runner";

// Loader
export {
  discoverAndLoadExtensions,
  loadExtensionFromFactory,
  loadExtensionFromFactorySync,
  loadExtensions,
} from "./loader";

// EventBus
export { createEventBus } from "./event-bus";
export type { EventBus } from "./event-bus";

// Source info
export { createSourceInfo } from "./source-info";
export type { SourceInfo } from "./source-info";

// Types
export type {
  ExecOptions,
  ExecResult,
  ExtensionPackageManifest,
  PhaseRegistration,
  RegisteredPhase,
  ToolDefinition,
  ToolExecutionResult,
  RegisteredTool,
  ExtensionError,
  ExtensionErrorListener,
  Extension,
  ExtensionRuntime,
  BeforePhaseHookResult,
  AfterPhaseHookResult,
  LoadExtensionsResult,
} from "./types";
export { createExtension, createExtensionRuntime } from "./types";
