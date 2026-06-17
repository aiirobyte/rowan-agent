/**
 * Extension types — simplified for the new hook-based system.
 */

import type { PhaseInput, PhaseOutput } from "../protocol/context";
import type { PhaseExecution } from "../loop/execution";
import type { PhaseContext } from "../harness/phases/types";
import type { ProviderConfig } from "@rowan-agent/models";
import type { Outcome } from "../types";
import type { ExtensionFactory } from "./api";

export type { ProviderConfig, ProviderModelConfig } from "@rowan-agent/models";

// ---------------------------------------------------------------------------
// Source info — tracks where an extension registration came from.
// ---------------------------------------------------------------------------

export interface SourceInfo {
  source: string;
  baseDir?: string;
  displayName?: string;
}

export function createSourceInfo(
  extensionPath: string,
  options: { source?: string; baseDir?: string } = {},
): SourceInfo {
  const source = options.source ?? (extensionPath.startsWith("<") ? "synthetic" : "local");
  const displayName = extensionPath.startsWith("<")
    ? extensionPath.slice(1, -1)
    : extensionPath.split("/").pop() ?? extensionPath;

  return {
    source,
    baseDir: options.baseDir,
    displayName,
  };
}

// ---------------------------------------------------------------------------
// Phase registration
// ---------------------------------------------------------------------------

/** Phase run function type for extensions */
export type PhaseRun = (context: PhaseContext, execution: PhaseExecution) => Promise<PhaseOutput | void>;

/** Phase definition shape used by extensions */
export type PhaseDefinition = {
  id: string;
  name: string;
  description: string;
  run?: PhaseRun;
  tools?: string[];
  skills?: string[];
  target?: string;
  input?: Record<string, string>;
};

export type PhaseRegistration = Partial<Omit<PhaseDefinition, 'run'>> & {
  /** Optional execution override — takes over model invocation */
  run?: PhaseRun;
};

export type RegisteredPhase = {
  definition: PhaseDefinition;
  source: {
    extensionPath: string;
  };
};

// ---------------------------------------------------------------------------
// Extension manifest (from package.json)
// ---------------------------------------------------------------------------

export type ExtensionPackageManifest = {
  rowan?: {
    extensions?: string[];
    phase?: {
      id?: string;
      name?: string;
      description?: string;
      tools?: string[];
      skills?: string[];
    };
  };
};

// ---------------------------------------------------------------------------
// Tool definition (for LLM-callable tools)
// ---------------------------------------------------------------------------

/**
 * Tool definition for registering LLM-callable tools via `api.registerTool()`.
 *
 * @example
 * ```typescript
 * api.registerTool({
 *   name: "search_docs",
 *   description: "Search documentation",
 *   parameters: { type: "object", properties: { query: { type: "string" } } },
 *   execute: async (args, ctx) => {
 *     return { content: [{ type: "text", text: "result" }] };
 *   },
 * });
 * ```
 */
export interface ToolDefinition {
  /** Tool name (used in LLM tool calls) */
  name: string;
  /** Description for LLM */
  description: string;
  /** Parameter schema (JSON Schema) */
  parameters: Record<string, unknown>;
  /** Execute the tool */
  execute: (args: unknown, signal?: AbortSignal) => Promise<ToolExecutionResult>;
  /** Optional: per-tool execution mode override */
  executionMode?: "sequential" | "parallel";
}

/**
 * Result from tool execution.
 */
export interface ToolExecutionResult {
  /** Content blocks to return to the LLM */
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  /** Whether this is an error result */
  isError?: boolean;
}

/**
 * Registered tool with source metadata.
 */
export interface RegisteredTool {
  definition: ToolDefinition;
  sourceInfo: SourceInfo;
}

// ---------------------------------------------------------------------------
// Extension error
// ---------------------------------------------------------------------------

/**
 * Structured extension error with attribution.
 */
export interface ExtensionError {
  /** Path of the extension that caused the error */
  extensionPath: string;
  /** Event or operation that caused the error */
  event: string;
  /** Error message */
  error: string;
  /** Optional stack trace */
  stack?: string;
}

/** Error listener callback type. */
export type ExtensionErrorListener = (error: ExtensionError) => void;

// ---------------------------------------------------------------------------
// Exec types
// ---------------------------------------------------------------------------

export type ExecOptions = {
  /** Working directory for the command. Defaults to cwd passed to runtime. */
  cwd?: string;
  /** Environment variables to add/override. */
  env?: Record<string, string>;
  /** Timeout in milliseconds. */
  timeout?: number;
  /** AbortSignal for cancellation. */
  signal?: AbortSignal;
};

export type ExecResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

// ---------------------------------------------------------------------------
// Provider pending queue
// ---------------------------------------------------------------------------

export type PendingProviderRegistration = {
  kind: "register";
  config: ProviderConfig;
};

export type PendingProviderUnregistration = {
  kind: "unregister";
  name: string;
};

// ---------------------------------------------------------------------------
// Hook results (for backward compatibility with runner.ts)
// ---------------------------------------------------------------------------

export type BeforePhaseHookResult = {
  abort?: Outcome;
  skip?: { route: string; message: string };
  input?: PhaseInput;
};

export type AfterPhaseHookResult = {
  abort?: Outcome;
  retry?: PhaseInput;
  output?: PhaseOutput;
};

// ---------------------------------------------------------------------------
// Extension tracking object (per-extension state)
// ---------------------------------------------------------------------------

type HandlerFn = (...args: unknown[]) => Promise<unknown>;

/**
 * Loaded extension with all registered items.
 * Tracks what each extension registered for attribution and cleanup.
 */
export interface Extension {
  /** Extension path (may be synthetic like `<builtin:phase:chat>`) */
  path: string;
  /** Resolved absolute path */
  resolvedPath: string;
  /** Source info for error messages */
  sourceInfo: SourceInfo;
  /** Event handlers registered by this extension */
  handlers: Map<string, HandlerFn[]>;
  /** Tools registered by this extension */
  tools: Map<string, RegisteredTool>;
  /** Phases registered by this extension */
  phases: Map<string, RegisteredPhase>;
}

/**
 * Create an Extension object with empty collections.
 */
export function createExtension(
  extensionPath: string,
  resolvedPath: string,
  sourceInfo: SourceInfo,
): Extension {
  return {
    path: extensionPath,
    resolvedPath,
    sourceInfo,
    handlers: new Map(),
    tools: new Map(),
    phases: new Map(),
  };
}

// ---------------------------------------------------------------------------
// Extension runtime (shared state)
// ---------------------------------------------------------------------------

/**
 * Shared runtime state created by loader, used during registration and runtime.
 * All ExtensionAPI instances reference this shared state.
 *
 * Key features:
 * - `invalidate()` / `assertActive()` — prevents stale context usage
 * - Pending provider registration queue
 * - Shared action implementations replaceable post-bind
 */
export interface ExtensionRuntime {
  /** Throws when this extension instance is stale after runtime replacement. */
  assertActive: () => void;
  /** Marks this extension instance as stale after runtime replacement or reload. */
  invalidate: (message?: string) => void;
  /** Provider registrations queued during extension loading, processed when runner binds */
  pendingProviderRegistrations: Array<{ name: string; config: ProviderConfig; extensionPath: string }>;
  /**
   * Register a provider.
   * Before bind(): queues registrations.
   * After bind(): calls provider registration directly.
   */
  registerProvider: (name: string, config: ProviderConfig, extensionPath?: string) => void;
  /**
   * Unregister a provider.
   * Before bind(): removes from queue.
   * After bind(): calls provider unregistration directly.
   */
  unregisterProvider: (name: string, extensionPath?: string) => void;
}

/**
 * Create an ExtensionRuntime with throwing stubs.
 * Runner.bind() replaces these with real implementations.
 */
export function createExtensionRuntime(): ExtensionRuntime {
  const state: { staleMessage?: string } = {};
  const assertActive = () => {
    if (state.staleMessage) {
      throw new Error(state.staleMessage);
    }
  };

  const runtime: ExtensionRuntime = {
    assertActive,
    invalidate: (message) => {
      state.staleMessage ??=
        message ??
        "This extension context is stale after session replacement or reload. Do not use a captured extension API after the runner has been replaced.";
    },
    pendingProviderRegistrations: [],
    // Pre-bind: queue registrations so bind() can flush them once the
    // model registry is available. bind() replaces both with direct calls.
    registerProvider: (name, config, extensionPath = "<unknown>") => {
      runtime.pendingProviderRegistrations.push({ name, config, extensionPath });
    },
    unregisterProvider: (name) => {
      runtime.pendingProviderRegistrations = runtime.pendingProviderRegistrations.filter(
        (r) => r.name !== name,
      );
    },
  };

  return runtime;
}

// ---------------------------------------------------------------------------
// Load result
// ---------------------------------------------------------------------------

/**
 * Result of loading extensions from filesystem.
 * The runner takes these and creates Extension tracking objects.
 */
export type LoadExtensionsResult = {
  extensions: LoadedExtension[];
  errors: Array<{ path: string; error: string }>;
};

/**
 * Pre-initialization extension form — factory + metadata.
 * Runner.loadExtensions() calls the factory and creates the full Extension object.
 */
export interface LoadedExtension {
  path: string;
  resolvedPath: string;
  name: string;
  factory: ExtensionFactory;
  manifest?: ExtensionManifest;
}

/** Extension manifest from package.json `rowan` field. */
export interface ExtensionManifest {
  entry?: string;
  name?: string;
  phase?: {
    id?: string;
    name?: string;
    description?: string;
    tools?: string[];
    skills?: string[];
  };
}

