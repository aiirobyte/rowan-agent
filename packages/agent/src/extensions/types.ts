import type {
  PhaseDefinition,
  PhaseHandler,
  PhaseInput,
  PhaseManifest,
  PhaseRun,
} from "../loop/phases/registry";
import type { SerializableTool } from "../harness/context/prompt-builder";
export type { PhaseManifest } from "../loop/phases/registry";

export type ExtensionHandler = (...args: unknown[]) => unknown | Promise<unknown>;

// ---------------------------------------------------------------------------
// Extension phase handler — lifecycle methods for a registered phase
// ---------------------------------------------------------------------------

export type ExtensionPhaseHandler = PhaseHandler;

export type PhaseRegistration = PhaseManifest & ExtensionPhaseHandler & {
  run: PhaseRun;
};

export type RegisteredPhase = {
  definition: PhaseDefinition;
  handler: ExtensionPhaseHandler;
  source: {
    extensionPath: string;
  };
};

export type Extension = {
  path: string;
  resolvedPath: string;
  phases: Map<string, RegisteredPhase>;
  eventHandlers: Map<string, ExtensionHandler[]>;
};

export type LoadExtensionsResult = {
  extensions: Extension[];
  errors: Array<{ path: string; error: string }>;
};

export type ExtensionPackageManifest = {
  rowan?: {
    extensions?: string[];
    phase?: PhaseManifest;
  };
};

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
// Extension Runtime — shared singleton for all implementations
// ---------------------------------------------------------------------------

/**
 * Shared runtime that holds all implementations.
 * Created once, then bound to real implementations via bindCore() or directly.
 * Extensions capture this in closures; it stays valid across session replacements.
 */
export type ExtensionRuntime = {
  // Lifecycle
  assertActive(): void;
  invalidate(message?: string): void;

  // Phase registration — writes to extension object
  registerPhase(extension: Extension, registration: PhaseRegistration): void;

  // Generic event handler registration — writes to extension object
  addEventHandler(extension: Extension, event: string, handler: ExtensionHandler): void;

  // Command execution
  exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;

  // ID generation
  id: {
    create(prefix: string): string;
  };

  // Formatting utilities
  format: {
    json(value: unknown): string;
    tools(tools: PhaseInput["tools"]): SerializableTool[];
    skills(skills: PhaseInput["skills"]): unknown[];
  };

  // Input utilities
  input: {
    latestUserMessage(input: PhaseInput): string;
  };
};

// ---------------------------------------------------------------------------
// Extension API — passed to factory functions, delegates to runtime
// ---------------------------------------------------------------------------

export type BeforePhaseHookContext = { phaseId: string };
export type AfterPhaseHookContext = { phaseId: string };

export type ExtensionAPI = {
  // Registration methods — delegate to runtime
  registerPhase(registration: PhaseRegistration): void;
  on(event: string, handler: ExtensionHandler): void;
  beforePhase(hook: (ctx: BeforePhaseHookContext) => void | Promise<void>): void;
  afterPhase(hook: (ctx: AfterPhaseHookContext) => void | Promise<void>): void;

  // Action methods — delegate to runtime
  exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;

  // Utility methods — delegate to runtime
  id: ExtensionRuntime["id"];
  format: ExtensionRuntime["format"];
  input: ExtensionRuntime["input"];

  // Runtime reference — for future action methods
  runtime: ExtensionRuntime;
};

// ---------------------------------------------------------------------------
// Extension factory — the default export of an extension module
// ---------------------------------------------------------------------------

export type ExtensionFactory = (rowan: ExtensionAPI) => void | Promise<void>;

export function defineExtension(factory: ExtensionFactory): ExtensionFactory {
  return factory;
}
