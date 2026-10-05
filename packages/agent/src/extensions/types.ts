/**
 * Extension types — simplified for the new hook-based system.
 */

import type { Phase, PhaseContext, PhaseOutput, SettingsDefinition } from "../harness/phases/types";
import type { PhaseExecution } from "../loop/execution";
import type { ExtensionDisposer, ExtensionFactory } from "./api";
import type { JsonObject, JsonValue, ToolExecutionResult } from "../runtime-events";
import type {
  ProviderConfig,
  ProviderModelConfig,
  ScopeRef,
  ToolKind,
  ToolCallStatus,
  ToolCallContent,
  ToolCallLocation,
  ToolCall,
  ToolCallUpdate,
  ToolAnnotations,
  ContentBlock,
} from "@rowan-agent/models";

export type {
  ProviderConfig,
  ProviderModelConfig,
  ScopeRef,
  ToolKind,
  ToolCallStatus,
  ToolCallContent,
  ToolCallLocation,
  ToolCall,
  ToolCallUpdate,
  ToolAnnotations,
  ContentBlock,
} from "@rowan-agent/models";

// ---------------------------------------------------------------------------
// UI contributions
// ---------------------------------------------------------------------------

export type UiSlot = "settings" | "model-picker";
export type UiContribution =
  | { slot: "settings"; id: string; title: string; description?: string; settings: SettingsDefinition }
  | { slot: "model-picker"; id: string; provider: string; status?: { kind: "ready" | "needs-setup" | "error"; message?: string }; actions?: { id: string; label: string }[] };

// ---------------------------------------------------------------------------
// Host & scope types
// ---------------------------------------------------------------------------

export interface ExtensionStateStore {
  get(key: string): Promise<JsonValue | undefined>;
  set(key: string, value: JsonValue): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface ExtensionHost {
  getConfig(
    extensionId: string,
    scope?: ScopeRef,
  ): Promise<JsonObject | null> | JsonObject | null;
  onConfigChanged?(
    listener: (extensionId: string, scope: ScopeRef) => void,
  ): (() => void) | void;
  getAgentState(
    extensionId: string,
    agentId: string,
    key: string,
  ): Promise<JsonValue | undefined> | JsonValue | undefined;
  setAgentState(
    extensionId: string,
    agentId: string,
    key: string,
    value: JsonValue,
  ): Promise<void> | void;
  deleteAgentState(
    extensionId: string,
    agentId: string,
    key: string,
  ): Promise<void> | void;
}

// ---------------------------------------------------------------------------
// Capability contributions
// ---------------------------------------------------------------------------

export type ExtensionToolContribution = {
  kind: "tool";
  name: string;
  description: string;
};

export type ExtensionCapabilityContribution = ExtensionToolContribution;

export type ExtensionCapability = {
  extensionId: string;
  kind: "tool";
  name: string;
  description: string;
};

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

/** A loaded directory Bundle used by an extension. */
export type PhaseDefinition = Phase;

/** Register a Phase by directory path or Phase object; PHASE.md and direct child Skills are loaded atomically when a path is supplied. */
export type PhaseRegistration = string | Phase;

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
  name?: string;
  rowan?: {
    id?: string;
    extensions?: string[];
  };
};

// ---------------------------------------------------------------------------
// Tool definition (for LLM-callable tools)
// ---------------------------------------------------------------------------

/**
 * Tool definition for registering LLM-callable tools via `api.tools.register()`.
 *
 * @example
 * ```typescript
 * api.tools.register({
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
  /** Optional: one-line snippet shown in the system prompt tool list */
  promptSnippet?: string;
  /** Optional: additional guidelines appended to system prompt */
  promptGuidelines?: string[];
  kind?: ToolKind;
  annotations?: ToolAnnotations;
  present?: (
    args: JsonValue,
    result?: ToolExecutionResult,
  ) => {
    title?: string;
    content?: ToolCallContent[];
    locations?: ToolCallLocation[];
    _meta?: JsonObject;
  } | Promise<{
    title?: string;
    content?: ToolCallContent[];
    locations?: ToolCallLocation[];
    _meta?: JsonObject;
  }>;
  /** Execute the tool */
  execute: (args: unknown, context: import("../runtime/contracts").ToolInvocationContext, signal?: AbortSignal) => Promise<ToolExecutionResult>;
  /** Optional: per-tool execution mode override */
  executionMode?: "sequential" | "parallel";
}

/**
 * Result from tool execution.
 */
export type { ToolExecutionResult } from "../runtime-events";

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
  id: string;
  /** Extension path (may be synthetic like `<inline>`) */
  path: string;
  /** Tools registered by this extension */
  tools: Map<string, RegisteredTool>;
  phases: Set<string>;
  capabilities: Map<string, ExtensionCapabilityContribution>;
  uiContributions: Map<string, UiContribution>;
  cleanup: Array<() => void | Promise<void>>;
  disposer?: ExtensionDisposer;
  runtime: ExtensionRuntime;
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
  id?: string;
  path: string;
  name: string;
  factory: ExtensionFactory;
  manifest?: ExtensionManifest;
}

/** Extension manifest from package.json `rowan` field. */
export interface ExtensionManifest {
  id?: string;
  entry?: string;
  name?: string;
}
