/**
 * @module extensions/context
 *
 * ExtensionContext - Main API for extension developers
 *
 * ## Quick Start
 *
 * ```typescript
 * import { defineExtension } from "@rowan-agent/agent";
 *
 * export default defineExtension((ctx) => {
 *   // 1. Subscribe to hooks
 *   ctx.on("before_tool_call", (event) => {
 *     console.log(`Tool: ${event.tool.name}`);
 *     return { allow: true };
 *   });
 *
 *   // 2. Register custom phase
 *   ctx.registerPhase({
 *     ...ctx.manifest?.phase,  // Read metadata from package.json
 *     id: "my-phase",
 *     run: async (context, input) => {
 *       return { message: "Done", route: "stop" };
 *     },
 *   });
 *
 *   // 3. Register model provider
 *   ctx.registerProvider({
 *     name: "custom",
 *     baseUrl: "https://api.example.com",
 *     api: "openai-completions",
 *     models: [...],
 *   });
 * });
 * ```
 *
 * ## Available Hooks
 *
 * | Hook | Trigger | Return |
 * |------|---------|--------|
 * | `before_phase` | Before phase execution | `{ abort?, skip?, input? }` |
 * | `after_phase` | After phase execution | `{ abort?, retry?, output? }` |
 * | `before_prompt` | Before building LLM request | `{ input? }` |
 * | `before_tool_call` | Before tool execution | `{ allow, reason? }` |
 * | `after_tool_call` | After tool execution | `{ result? }` |
 * | `agent_start` | Agent starts | Listen only |
 * | `agent_end` | Agent ends | Listen only |
 * | `message_*` | Message lifecycle | Listen only |
 * | `tool_execution_*` | Tool execution lifecycle | Listen only |
 */

import type { ProviderConfig } from "@rowan-agent/models";
import type { PhaseRegistration } from "./types";
import type { HooksManager, HookEventType, HookHandler } from "./hooks";
import type { LlmRequest } from "@rowan-agent/models";
import type { PhaseInput } from "../loop/phases/registry";
import { buildModelRequest } from "../harness/context/prompt-builder";

// ---------------------------------------------------------------------------
// ExtensionContext - Main API for extension developers
// ---------------------------------------------------------------------------

/**
 * Extension context object passed to extension factory function.
 *
 * @example
 * ```typescript
 * export default defineExtension((ctx) => {
 *   // ctx provides all extension APIs
 * });
 * ```
 */
export interface ExtensionContext {
  /**
   * Subscribe to a hook event.
   *
   * @param eventType - Hook type, e.g. "before_tool_call"
   * @param handler - Hook handler, can return result to modify behavior
   *
   * @example
   * ```typescript
   * ctx.on("before_tool_call", (event) => {
   *   // event contains { tool, args }
   *   if (event.tool.name === "bash") {
   *     return { allow: false, reason: "Blocked" };
   *   }
   *   return { allow: true };
   * });
   * ```
   */
  on<K extends HookEventType>(eventType: K, handler: HookHandler<K>): void;

  /**
   * Unsubscribe from a hook event.
   */
  off<K extends HookEventType>(eventType: K, handler: HookHandler<K>): void;

  /**
   * Register a custom phase.
   *
   * Phases are state machine nodes that can be referenced by the routing system.
   *
   * @param registration - Phase registration info
   *
   * @example
   * ```typescript
   * ctx.registerPhase({
   *   id: "review",
   *   name: "Code Review",
   *   description: "Review code changes",
   *
   *   // Optional: declarative prompt config
   *   prompt: {
   *     instructions: [
   *       "Phase: review",
   *       "Review code changes, call route tool if looks good",
   *     ],
   *   },
   *
   *   // Optional: custom execution logic
   *   async run(context, input) {
   *     const result = await context.model.invoke({ input });
   *     return { message: result.text, route: "stop" };
   *   },
   * });
   * ```
   */
  registerPhase(registration: PhaseRegistration): void;

  /**
   * Register a model provider.
   *
   * @param config - Provider configuration
   *
   * @example
   * ```typescript
   * ctx.registerProvider({
   *   name: "custom-llm",
   *   baseUrl: "https://api.custom.com/v1",
   *   api: "openai-completions",
   *   models: [{
   *     id: "custom-7b",
   *     name: "Custom 7B",
   *     api: "openai-completions",
   *     reasoning: false,
   *     input: ["text"],
   *     cost: { input: 0.1, output: 0.2, cacheRead: 0, cacheWrite: 0 },
   *     contextWindow: 8192,
   *     maxTokens: 4096,
   *   }],
   * });
   * ```
   */
  registerProvider(config: ProviderConfig): void;

  /**
   * Unregister a model provider.
   */
  unregisterProvider(name: string): void;

  /**
   * Extension manifest from package.json `rowan` field.
   *
   * Can be used to auto-fill phase metadata:
   * ```typescript
   * ctx.registerPhase({
   *   ...ctx.manifest?.phase,  // Auto-fill id, name, description
   *   run: async (context, input) => { ... },
   * });
   * ```
   */
  manifest?: ExtensionManifest;

  /**
   * Utility functions.
   */
  utils: ExtensionUtils;
}

// ---------------------------------------------------------------------------
// ExtensionManifest - rowan field in package.json
// ---------------------------------------------------------------------------

/**
 * Extension manifest defined in package.json `rowan` field.
 *
 * @example
 * ```json
 * {
 *   "name": "my-extension",
 *   "rowan": {
 *     "extensions": ["./index.ts"],
 *     "phase": {
 *       "id": "review",
 *       "name": "Code Review",
 *       "description": "Review code changes",
 *       "tools": ["read", "bash"],
 *       "skills": ["code-review"]
 *     }
 *   }
 * }
 * ```
 */
export interface ExtensionManifest {
  /** Extension entry file path */
  entry?: string;
  /** Extension name (for logging) */
  name?: string;
  /** Phase manifest */
  phase?: {
    /** Phase ID */
    id?: string;
    /** Phase name */
    name?: string;
    /** Phase description */
    description?: string;
    /** Tools available in this phase. Omit to use all tools. */
    tools?: string[];
    /** Skills available in this phase. Omit to use all skills. */
    skills?: string[];
  };
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

  /**
   * Build LlmRequest from PhaseInput.
   * @param input - Phase input
   * @returns LLM request object
   */
  buildModelRequest(input: PhaseInput): LlmRequest;

  /**
   * Create a prompt builder.
   * @param instructions - Instruction list
   * @returns Builder function
   *
   * @example
   * ```typescript
   * const builder = ctx.utils.createPromptBuilder([
   *   "Phase: review",
   *   "Review code changes",
   * ]);
   *
   * // Use in buildPrompt
   * ctx.registerPhase({
   *   id: "review",
   *   buildPrompt: builder,
   * });
   * ```
   */
  createPromptBuilder(instructions: string[]): (input: PhaseInput) => LlmRequest;
}

// ---------------------------------------------------------------------------
// ExtensionFactory - Extension factory function type
// ---------------------------------------------------------------------------

/**
 * Extension factory function.
 * Receives ExtensionContext for registering hooks, phases, and providers.
 *
 * @param ctx - Extension context
 *
 * @example
 * ```typescript
 * const factory: ExtensionFactory = (ctx) => {
 *   ctx.on("before_tool_call", handler);
 * };
 * ```
 */
export type ExtensionFactory = (ctx: ExtensionContext) => void | Promise<void>;

/**
 * Helper function to define an extension with type inference.
 *
 * @param factory - Extension factory function
 * @returns Factory function (returns as-is)
 *
 * @example
 * ```typescript
 * export default defineExtension((ctx) => {
 *   ctx.on("before_tool_call", (event) => {
 *     // event type is automatically inferred
 *     return { allow: true };
 *   });
 * });
 * ```
 */
export function defineExtension(factory: ExtensionFactory): ExtensionFactory {
  return factory;
}

// ---------------------------------------------------------------------------
// LoadedExtension - Loaded extension object
// ---------------------------------------------------------------------------

/**
 * Loaded extension object containing factory function and manifest.
 */
export interface LoadedExtension {
  /** Extension path (may be synthetic like `<builtin:phase:chat>`) */
  path: string;
  /** Resolved absolute path */
  resolvedPath: string;
  /** Extension name (from manifest or directory name) */
  name: string;
  /** Extension factory function */
  factory: ExtensionFactory;
  /** Extension manifest (from package.json) */
  manifest?: ExtensionManifest;
}

// ---------------------------------------------------------------------------
// Internal: Create ExtensionContext instance
// ---------------------------------------------------------------------------

/**
 * @internal
 * Create ExtensionContext instance.
 */
export function createExtensionContext(
  hooks: HooksManager,
  _extensionPath: string,
  options: {
    registerPhase: (registration: PhaseRegistration) => void;
    registerProvider: (config: ProviderConfig) => void;
    unregisterProvider: (name: string) => void;
    manifest?: ExtensionManifest;
  },
): ExtensionContext {
  let idCounter = 0;
  const createId = (prefix: string): string => {
    idCounter++;
    return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
  };

  const formatJson = (value: unknown): string => {
    try {
      return JSON.stringify(value, null, 2) ?? "undefined";
    } catch {
      return "[unserializable]";
    }
  };

  const createPromptBuilder = (instructions: string[]) => {
    return (input: PhaseInput): LlmRequest => {
      const req = buildModelRequest(input);
      if (instructions.length > 0) {
        req.messages.push({
          role: "user",
          content: instructions.join("\n"),
        });
      }
      return req;
    };
  };

  return {
    on: (eventType, handler) => hooks.on(eventType, handler),
    off: (eventType, handler) => hooks.off(eventType, handler),
    registerPhase: options.registerPhase,
    registerProvider: options.registerProvider,
    unregisterProvider: options.unregisterProvider,
    manifest: options.manifest,
    utils: {
      createId,
      formatJson,
      buildModelRequest,
      createPromptBuilder,
    },
  };
}
