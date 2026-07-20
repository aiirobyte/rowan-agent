/**
 * @module extensions/context
 *
 * Extension context types — runtime state and phase execution context.
 *
 * For ExtensionAPI and createExtensionAPI, see ./api.ts
 */

import type {
  ExecOptions,
  ExecResult,
  ExtensionManifest,
} from "./types";
export { createEventBus } from "./event-bus";
export type { EventBus } from "./event-bus";

export type { LoadedExtension, ExtensionManifest } from "./types";

// ---------------------------------------------------------------------------
// ExtensionContext - Runtime context for event handlers
// ---------------------------------------------------------------------------

/**
 * Runtime context available to extensions during event handler execution.
 *
 * Provides access to agent state, working directory, and utility methods.
 * Values are resolved lazily via getters, so changes via `runner.bind()` are
 * reflected immediately without recreating the context.
 *
 * @example
 * ```typescript
 * api.on("before_tool_call", (event, ctx) => {
 *   console.log(`cwd: ${ctx.cwd}`);
 *   if (ctx.isIdle()) { ... }
 * });
 * ```
 */
export interface ExtensionContext {
  /** Current working directory */
  cwd: string;

  /** Abort signal — fires when the agent operation is cancelled */
  signal: AbortSignal | undefined;

  /** Whether the agent is currently idle (not streaming) */
  isIdle(): boolean;

  /** Abort the current agent operation */
  abort(): void;

  /**
   * Execute a shell command.
   *
   * @param command - The command to run
   * @param args - Command arguments
   * @param options - Execution options (cwd, env, timeout, signal)
   * @returns Execution result with exitCode, stdout, stderr
   */
  exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;

  /** Extension manifest from package.json `rowan` field */
  manifest?: ExtensionManifest;

  /** Current model ID, if available */
  modelId?: string;

  /** Get current system prompt */
  getSystemPrompt?(): string;

  /** Set/override the system prompt */
  setSystemPrompt?(prompt: string): void;

  /** Get the full message history */
  getMessages?(): Array<{ role: string; content: string }>;

  /** Append a message to the history */
  addMessage?(role: "user" | "assistant" | "system", content: string): void;

  /** Get all available tools */
  getAvailableTools?(): Array<{ name: string; description: string }>;

  /** Get all available skills */
  getAvailableSkills?(): Array<{ name: string; description: string }>;

  /** Get skill content by name */
  getSkillContent?(skillName: string): string;

  /** Get all available phase names */
  getAvailablePhases?(): string[];

  /** Get phase content by name */
  getPhaseContent?(phaseName: string): string;
}

// ---------------------------------------------------------------------------
// ExtensionUtils - Utility functions
// ---------------------------------------------------------------------------

/**
 * Utility functions available to extensions.
 */
export interface ExtensionUtils {
  /**
   * Generate unique ID.
   * @param prefix - ID prefix
   * @returns Format: `{prefix}_{timestamp}_{counter}`
   */
  createId(prefix: string): string;

  /**
   * JSON serialization (with indentation).
   * @param value - Value to serialize
   * @returns JSON string
   */
  formatJson(value: unknown): string;
}
