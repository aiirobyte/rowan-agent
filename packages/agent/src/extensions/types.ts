import type {
  PhaseDefinition,
  PhaseInput,
  PhaseManifest,
  PhaseOutput,
  PhaseRun,
} from "../loop/phases/registry";
import type { LlmRequest, ProviderConfig } from "@rowan-agent/models";
import type { Outcome, Tool, ToolResult } from "../types";
export type { PhaseManifest } from "../loop/phases/registry";
export type { ProviderConfig, ProviderModelConfig } from "@rowan-agent/models";

export type ExtensionHandler = (...args: unknown[]) => unknown | Promise<unknown>;

// ---------------------------------------------------------------------------
// Extension phase handler — lifecycle methods for a registered phase
// ---------------------------------------------------------------------------

/** PhaseHandler only contains buildPrompt — other hooks removed in ADR-0015 refactor. */
export type ExtensionPhaseHandler = {
  buildPrompt?(input: PhaseInput): LlmRequest;
};

/** Declarative prompt configuration — alternative to implementing buildPrompt. */
export type PhasePromptConfig = {
  /** Lines to append as a user message with phase instructions. */
  instructions?: string[];
};

export type PhaseRegistration = PhaseManifest & {
  /** Optional execution override — takes over model invocation at step 4 */
  run?: PhaseRun;
  /** Declarative prompt config — framework generates buildPrompt from this */
  prompt?: PhasePromptConfig;
  /** Custom prompt builder — overrides prompt config if provided */
  buildPrompt?: ExtensionPhaseHandler["buildPrompt"];
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
// Provider pending queue — used during the load phase
// ---------------------------------------------------------------------------

export type PendingProviderRegistration = {
  kind: "register";
  config: ProviderConfig;
};

export type PendingProviderUnregistration = {
  kind: "unregister";
  name: string;
};

export type PendingProviderAction = PendingProviderRegistration | PendingProviderUnregistration;

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

  // Provider registration — phase-aware
  registerProvider(config: ProviderConfig): void;
  unregisterProvider(name: string): void;

  // Lifecycle transition — flushes pending queue, switches to immediate mode
  bind(): void;

  // ID generation
  id: {
    create(prefix: string): string;
  };

  // Formatting utilities
  format: {
    json(value: unknown): string;
  };

  // Input utilities
  input: {
    latestUserMessage(input: PhaseInput): string;
  };

  // Prompt building
  prompt: {
    buildModelRequest(input: PhaseInput): LlmRequest;
  };
};

// ---------------------------------------------------------------------------
// Tool call interception types
// ---------------------------------------------------------------------------

export type BeforeToolCallContext = {
  tool: Tool;
  args: unknown;
  allow: boolean;
  reason?: string;
};

export type AfterToolCallContext = {
  tool: Tool;
  result: ToolResult;
};

// ---------------------------------------------------------------------------
// Extension API — passed to factory functions, delegates to runtime
// ---------------------------------------------------------------------------

export type BeforePhaseHookContext = { phaseId: string; input?: PhaseInput };
export type AfterPhaseHookContext = { phaseId: string; output: PhaseOutput };

/** Context for before_prompt hooks — allows transforming PhaseInput before buildPrompt. */
export type BeforePromptHookContext = { phaseId: string; input: PhaseInput };

/** Aggregated result from all extension beforePhase hooks. */
export type BeforePhaseHookResult = {
  abort?: Outcome;
  skip?: { route: string; message: string };
  input?: PhaseInput;
};

/** Aggregated result from all extension afterPhase hooks. */
export type AfterPhaseHookResult = {
  abort?: Outcome;
  retry?: PhaseInput;
  output?: PhaseOutput;
};

export type ExtensionAPI = {
  // Event subscription
  on(event: string, handler: ExtensionHandler): void;

  // Phase registration
  registerPhase(registration: PhaseRegistration): void;
  beforePhase(hook: (ctx: BeforePhaseHookContext) => void | Promise<void>): void;
  afterPhase(hook: (ctx: AfterPhaseHookContext) => void | Promise<void>): void;
  beforePrompt(hook: (ctx: BeforePromptHookContext) => void | Promise<void>): void;

  // Tool call interception
  beforeToolCall(hook: (ctx: BeforeToolCallContext) => void | Promise<void>): void;
  afterToolCall(hook: (ctx: AfterToolCallContext) => void | Promise<void>): void;

  // Provider registration
  registerProvider(config: ProviderConfig): void;
  unregisterProvider(name: string): void;

  // Command execution
  exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;

  // Utilities
  id: ExtensionRuntime["id"];
  format: ExtensionRuntime["format"];
  input: ExtensionRuntime["input"];
  prompt: ExtensionRuntime["prompt"];
};

// ---------------------------------------------------------------------------
// Extension factory — the default export of an extension module
// ---------------------------------------------------------------------------

export type ExtensionFactory = (rowan: ExtensionAPI) => void | Promise<void>;

export function defineExtension(factory: ExtensionFactory): ExtensionFactory {
  return factory;
}
