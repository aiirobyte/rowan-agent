/**
 * Extension types — simplified for the new hook-based system.
 */

import type { PhaseContext, PhaseOutput } from "../harness/phases/types";
import type { PhaseExecution } from "../loop/execution";
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
  name: string;
  description: string;
  run?: PhaseRun;
  tools?: string[];
  skills?: string[];
  target?: string;
  input?: Record<string, string>;
  model?: string;
};

export type PhaseRegistration = Omit<PhaseDefinition, 'run'> & {
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
// Extension tracking object (per-extension state)
// ---------------------------------------------------------------------------

/**
 * Loaded extension with all registered items.
 * Tracks the tools registered by each extension for attribution and cleanup.
 */
export interface Extension {
  /** Extension path (may be synthetic like `<inline>`) */
  path: string;
  /** Tools registered by this extension */
  tools: Map<string, RegisteredTool>;
}

// ---------------------------------------------------------------------------
// Extension runtime (shared state)
// ---------------------------------------------------------------------------

/**
 * Shared runtime state created by loader, used during registration and runtime.
 * All ExtensionAPI instances reference this shared state.
 *
 * It only owns the lifetime guard shared by captured Extension API objects.
 */
export interface ExtensionRuntime {
  /** Throws when this extension instance is stale after runtime replacement. */
  assertActive: () => void;
  /** Marks this extension instance as stale after runtime replacement or reload. */
  invalidate: (message?: string) => void;
}

/** Create the lifetime guard shared by captured Extension API objects. */
export function createExtensionRuntime(): ExtensionRuntime {
  const state: { staleMessage?: string } = {};
  const assertActive = () => {
    if (state.staleMessage) {
      throw new Error(state.staleMessage);
    }
  };

  return {
    assertActive,
    invalidate: (message) => {
      state.staleMessage ??=
        message ??
        "This extension context is stale after runtime replacement or reload. Do not use a captured extension API after the runner has been replaced.";
    },
  };
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
  name: string;
  factory: ExtensionFactory;
  manifest?: ExtensionManifest;
}

/** Extension manifest from package.json `rowan` field. */
export interface ExtensionManifest {
  entry?: string;
  name?: string;
  phase?: {
    name?: string;
    description?: string;
    tools?: string[];
    skills?: string[];
  };
}
