/**
 * Extension types — simplified for the new hook-based system.
 */

import type { Phase, PhaseContext, PhaseOutput } from "../harness/phases/types";
import type { Skill } from "../protocol";
import type { PhaseExecution } from "../loop/execution";
import type { ExtensionDisposer, ExtensionFactory } from "./api";
import type { JsonObject, JsonValue } from "../runtime-events";
import type { Tool } from "../runtime/contracts";
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
  ToolProgress,
  ContentBlock,
  ToolResult,
} from "@rowan-agent/models";

export type {
  ProviderConfig,
  ProviderModelConfig,
  ScopeRef,
  ToolKind,
  ToolCallStatus,
  ToolCallContent,
  ToolCallLocation,
  ToolProgress,
  ToolCall,
  ToolCallUpdate,
  ToolAnnotations,
  ContentBlock,
  ToolResult,
} from "@rowan-agent/models";

export type { Tool } from "../runtime/contracts";

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
  getGlobalState(
    extensionId: string,
    key: string,
  ): Promise<JsonValue | undefined> | JsonValue | undefined;
  setGlobalState(
    extensionId: string,
    key: string,
    value: JsonValue,
  ): Promise<void> | void;
  deleteGlobalState(
    extensionId: string,
    key: string,
  ): Promise<void> | void;
  /**
   * Called once per extension load. The returned namespaces are merged into that extension's `api`
   * (a name already used by Rowan's own API is an error). `dispose` runs when the extension is
   * unloaded, reloaded or fails activation, so the host can drop everything that extension registered.
   */
  extendApi?(extensionId: string): HostApiExtension | undefined;
}

export interface HostApiExtension {
  readonly namespaces: Readonly<Record<string, unknown>>;
  dispose?(): void;
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
  sourceId: string;
  scope?: ScopeRef;
};

// ---------------------------------------------------------------------------
// Skill registration
// ---------------------------------------------------------------------------

/** Register a Skill directory (containing SKILL.md) or a Skill object. Registering an existing name replaces it. */
export type SkillRegistration = string | Skill;

export type RegisteredSkill = {
  definition: Skill;
  source: {
    extensionPath: string;
  };
  sourceId: string;
  scope?: ScopeRef;
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
 * Registered tool with source metadata.
 */
export interface RegisteredTool {
  definition: Tool;
  sourceInfo: SourceInfo;
  sourceId: string;
  scope?: ScopeRef;
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
  skills: Set<string>;
  capabilities: Map<string, ExtensionCapabilityContribution>;
  cleanup: Array<() => void | Promise<void>>;
  disposer?: ExtensionDisposer;
  runtime: ExtensionRuntime;
  hostApi?: HostApiExtension;
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
