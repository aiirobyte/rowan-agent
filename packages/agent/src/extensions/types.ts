/**
 * Extension types — simplified for the new hook-based system.
 */

import type {
  PhaseDefinition,
  PhaseInput,
  PhaseManifest,
  PhaseOutput,
  PhaseRun,
} from "../loop/phases/registry";
import type { LlmRequest, ProviderConfig } from "@rowan-agent/models";
import type { Outcome } from "../types";

export type { PhaseManifest } from "../loop/phases/registry";
export type { ProviderConfig, ProviderModelConfig } from "@rowan-agent/models";

// ---------------------------------------------------------------------------
// Phase registration
// ---------------------------------------------------------------------------

/** Declarative prompt configuration — alternative to implementing buildPrompt. */
export type PhasePromptConfig = {
  /** Lines to append as a user message with phase instructions. */
  instructions?: string[];
};

export type PhaseRegistration = Partial<PhaseManifest> & {
  /** Optional execution override — takes over model invocation */
  run?: PhaseRun;
  /** Declarative prompt config — framework generates buildPrompt from this */
  prompt?: PhasePromptConfig;
  /** Custom prompt builder — overrides prompt config if provided */
  buildPrompt?: (input: PhaseInput) => LlmRequest;
};

export type RegisteredPhase = {
  definition: PhaseDefinition;
  handler: {
    buildPrompt?: (input: PhaseInput) => LlmRequest;
  };
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

export type PendingProviderAction = PendingProviderRegistration | PendingProviderUnregistration;

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
// Legacy types (used by builtin/loader)
// ---------------------------------------------------------------------------

export type ExtensionHandler = (...args: unknown[]) => unknown | Promise<unknown>;

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

export type ExtensionPhaseHandler = {
  buildPrompt?(input: PhaseInput): LlmRequest;
};
