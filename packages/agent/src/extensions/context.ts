/**
 * @module extensions/context
 *
 * ExtensionAPI - Main API for extension developers
 *
 * ## Quick Start
 *
 * ```typescript
 * import type { ExtensionAPI } from "@rowan-agent/agent";
 *
 * export default function(api: ExtensionAPI) {
 *   // 1. Subscribe to hooks
 *   api.on("before_tool_call", (event) => {
 *     console.log(`Tool: ${event.tool.name}`);
 *     return { allow: true };
 *   });
 *
 *   // 2. Register custom tool
 *   api.registerTool({
 *     name: "search_docs",
 *     description: "Search documentation",
 *     parameters: { type: "object", properties: { query: { type: "string" } } },
 *     execute: async (args) => {
 *       return { content: [{ type: "text", text: "result" }] };
 *     },
 *   });
 *
 *   // 3. Register custom phase
 *   api.registerPhase({
 *     ...api.manifest?.phase,  // Read metadata from package.json
 *     id: "my-phase",
 *     run: async (context, input) => {
 *       return { message: "Done", route: "stop" };
 *     },
 *   });
 *
 *   // 4. Register model provider
 *   api.registerProvider({
 *     name: "custom",
 *     baseUrl: "https://api.example.com",
 *     api: "openai-completions",
 *     models: [...],
 *   });
 *
 *   // 5. Inter-extension communication
 *   api.events.on("other-plugin:ready", (data) => {
 *     console.log("Plugin ready:", data);
 *   });
 * }
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
import type {
  PhaseRegistration,
  ExecOptions,
  ExecResult,
  ToolDefinition,
  ExtensionRuntime,
  LoadedExtension,
  ExtensionManifest,
} from "./types";
import type { EventBus } from "./event-bus";
export { createEventBus } from "./event-bus";
export type { EventBus } from "./event-bus";

export type { LoadedExtension, ExtensionManifest } from "./types";
import type { HooksManager, HookEventType, HookHandler } from "./hooks";
import type { LlmRequest } from "@rowan-agent/models";
import type { PhaseInput } from "../protocol/context";
import { buildModelRequest } from "../harness/context/prompt-builder";

// ---------------------------------------------------------------------------
// ExtensionAPI - Main API for extension developers
// ---------------------------------------------------------------------------

/**
 * Extension API object passed to extension factory function.
 *
 * @example
 * ```typescript
 * export default function(api: ExtensionAPI) {
 *   // api provides all extension APIs
 * }
 * ```
 */
export interface ExtensionAPI {
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
   * Register a custom LLM-callable tool.
   *
   * @param tool - Tool definition with name, description, parameters, and execute function
   *
   * @example
   * ```typescript
   * api.registerTool({
   *   name: "search_docs",
   *   description: "Search project documentation",
   *   parameters: {
   *     type: "object",
   *     properties: { query: { type: "string" } },
   *     required: ["query"],
   *   },
   *   execute: async (args, signal) => {
   *     const query = (args as any).query;
   *     return { content: [{ type: "text", text: `Results for: ${query}` }] };
   *   },
   * });
   * ```
   */
  registerTool(tool: ToolDefinition): void;

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

  /**
   * Runtime context — provides access to agent state, cwd, and utilities.
   *
   * Available after extension loading completes. Use for runtime operations
   * like executing shell commands or checking agent state.
   */
  context: ExtensionContext;

  /**
   * Shared event bus for inter-extension communication.
   *
   * Extensions can emit and subscribe to arbitrary events to coordinate
   * without direct coupling.
   *
   * @example
   * ```typescript
   * // Extension A
   * api.events.on("my-plugin:ready", (data) => {
   *   console.log("Plugin ready:", data);
   * });
   *
   * // Extension B
   * api.events.emit("my-plugin:ready", { version: "1.0" });
   * ```
   */
  events: EventBus;
}

// ExtensionManifest is re-exported from ./types.ts

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
 * This is distinct from ExtensionAPI (which is for registration) —
 * ExtensionContext gives runtime state during hook execution.
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
 * Receives ExtensionAPI for registering hooks, phases, and providers.
 *
 * @param api - Extension API
 *
 * @example
 * ```typescript
 * const factory: ExtensionFactory = (api) => {
 *   api.on("before_tool_call", handler);
 * };
 * ```
 */
export type ExtensionFactory = (api: ExtensionAPI) => void | Promise<void>;

// LoadedExtension is re-exported from ./types.ts

// ---------------------------------------------------------------------------
// Internal: Create ExtensionAPI instance
// ---------------------------------------------------------------------------

/**
 * @internal
 * Create ExtensionAPI instance.
 *
 * @param hooks - HooksManager for event subscription
 * @param extensionPath - Path of this extension (for error attribution)
 * @param options - Registration callbacks and context
 * @param runtime - Shared ExtensionRuntime for lifecycle protection
 * @param eventBus - Shared EventBus for inter-extension communication
 */
export function createExtensionAPI(
  hooks: HooksManager,
  _extensionPath: string,
  options: {
    registerPhase: (registration: PhaseRegistration) => void;
    registerProvider: (config: ProviderConfig) => void;
    unregisterProvider: (name: string) => void;
    registerTool: (tool: ToolDefinition) => void;
    context: ExtensionContext;
    manifest?: ExtensionManifest;
  },
  runtime: ExtensionRuntime,
  eventBus: EventBus,
): ExtensionAPI {
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
    on: (eventType, handler) => {
      runtime.assertActive();
      hooks.on(eventType, handler);
    },
    off: (eventType, handler) => {
      runtime.assertActive();
      hooks.off(eventType, handler);
    },
    registerTool: (tool) => {
      runtime.assertActive();
      options.registerTool(tool);
    },
    registerPhase: (registration) => {
      runtime.assertActive();
      options.registerPhase(registration);
    },
    registerProvider: (config) => {
      runtime.assertActive();
      options.registerProvider(config);
    },
    unregisterProvider: (name) => {
      runtime.assertActive();
      options.unregisterProvider(name);
    },
    manifest: options.manifest,
    utils: {
      createId,
      formatJson,
      buildModelRequest,
      createPromptBuilder,
    },
    context: options.context,
    events: eventBus,
  };
}
