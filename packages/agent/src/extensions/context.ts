/**
 * @module extensions/context
 *
 * Extension context types — runtime state and phase execution context.
 *
 * For ExtensionAPI and createExtensionAPI, see ./api.ts
 */

import type { ExecOptions, ExecResult } from "./types";
export { createEventBus } from "./event-bus";
export type { EventBus } from "./event-bus";
export type { LoadedExtension, ExtensionManifest } from "./types";

// ---------------------------------------------------------------------------
// ExtensionContext - Runtime context for event handlers
// ---------------------------------------------------------------------------

/**
 * Runtime context available to extensions during event handler execution.
 */
export interface ExtensionContext {
  /** Current working directory */
  readonly cwd: string;

  /** Abort signal — fires when the agent operation is cancelled */
  readonly signal: AbortSignal | undefined;

  /**
   * Execute a shell command.
   *
   * @param command - The command to run
   * @param args - Command arguments
   * @param options - Execution options (cwd, env, timeout, signal)
   * @returns Execution result with exitCode, stdout, stderr
   */
  exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
}
