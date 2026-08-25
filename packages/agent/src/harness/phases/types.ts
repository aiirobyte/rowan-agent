import type { ModelRef } from "@rowan-agent/models";
import type { AgentMessage, Skill } from "../../protocol";
import type { Tool } from "../../types";
import type { PhaseExecution } from "../../loop/execution";
import type { ExtensionAPI } from "../../extensions/api";

export type PhaseStatusState = "running" | "completed";

/** Normalized status event exposed to Runtime consumers. */
export type PhaseStatus = Readonly<{
  state: PhaseStatusState;
  /** Stable consumer-facing status identifier, e.g. `compacting`. */
  kind: string;
  /** Optional human-readable detail for UI/status consumers. */
  message?: string;
  /** Structured status payload. */
  payload?: unknown;
}>;

/** Unified phase output — model-driven routing is optional; programmatic phases may normalize omission to stop. */
export type PhaseOutput = {
  /** User-visible assistant message. */
  message?: string;
  /** Final status update for non-conversational consumers. */
  status?: PhaseStatus;
  /** Route to next phase, or "continue" to re-execute current phase, or "stop" to end. Undefined means no model route. */
  route?: string;
  /** Phase name that produced this output */
  phase?: string;
  /** Tool calls from the model invocation (used by framework for route extraction) */
  toolCalls?: Array<{ id: string; name: string; args: unknown }>;
  /** Route reason extracted from route tool call (for hooks to inspect) */
  routeReason?: string;
  /** Structured data from this phase, passed to the next phase */
  payload?: unknown;
};

/** Phase machine state — tracks position and inter-phase data */
export interface PhaseState {
  current: string;
  available: string[];
  iterations: number;
  payload?: unknown;
}

export type PhaseInvocation =
  | {
      mode: "serial";
      instanceId: string;
    }
  | {
      mode: "parallel";
      instanceId: string;
      groupId: string;
      index: number;
      count: number;
      sourcePhaseId: string;
  };

/** Durable identity of the Run execution currently invoking a Phase. */
export type PhaseExecutionIdentity = Readonly<{
  agentId: string;
  runId: string;
  executionId: string;
  /** Opaque metadata captured at the durable boundary; Rowan does not decode it. */
  agentMetadata?: Readonly<Record<string, unknown>>;
  runMetadata?: Readonly<Record<string, unknown>>;
}>;

/** Everything a phase needs to execute */
export interface PhaseContext {
  systemPrompt: string;
  messages: AgentMessage[];
  /** Phase-filtered tools */
  tools: Tool[];
  /** Phase-filtered skills */
  skills: Skill[];
  /** Phase machine state */
  state: PhaseState;
  /** Identity and dispatch metadata for this phase execution */
  readonly invocation: PhaseInvocation;
  /** Durable Run identity for cross-store integrations and idempotent commands. */
  readonly execution: PhaseExecutionIdentity;
  /** Additional guideline bullets appended to the system prompt */
  promptGuidelines?: string[];
  /** Text to append after the system prompt */
  appendSystemPrompt?: string;
}

/**
 * Frontmatter properties parsed from PHASE.md
 */
export interface PhaseFrontmatter {
  /** Phase name; defaults to the phase directory name when omitted. */
  name?: string;
  /** Phase description (shown in route tool) */
  description?: string;
  /** Restrict available tools */
  tools?: string[];
  /** Forced next phase name */
  target?: string;
  /** Expected input fields (key → description) */
  input?: Record<string, string>;
  /** If true, phase gets a fresh context (empty messages) when executed in parallel */
  isolated?: boolean;
  /** Model override for this phase (e.g. "anthropic/claude-sonnet-4-20250514" or "gpt-4.1") */
  model?: string;
  /** Do not automatically inject this Phase into the model route catalog/context. */
  disableAutoInvocation?: boolean;
  /** Do not expose this Phase to direct user invocation. */
  disableImplicitInvocation?: boolean;
}

/**
 * Phase static configuration — describes what a phase is, not how it runs.
 */
export interface PhaseConfig {
  name: string;
  description: string;
  tools?: string[];
  target?: string;
  filePath?: string;
  baseDir?: string;
  content: string;
  input?: Record<string, string>;
  disableAutoInvocation?: boolean;
  disableImplicitInvocation?: boolean;
}

/**
 * Loaded Phase object
 */
export interface Phase {
  /** Unique phase identity and display name. */
  name: string;
  /** Rowan-owned built-in Phase; built-ins are never filtered or disabled. */
  core?: boolean;
  /** Description */
  description: string;
  /** Restricted tools (undefined = all tools available) */
  tools?: string[];
  /** Skills bundled directly inside this phase directory. Inline phases may omit this (equivalent to []). */
  skills?: Skill[];
  /** Forced next phase */
  target?: string;
  /** Expected input fields (key → description) */
  input?: Record<string, string>;
  /** If true, phase gets a fresh context when executed in parallel */
  isolated?: boolean;
  /** Path to PHASE.md file */
  filePath: string;
  /** Phase directory path */
  baseDir: string;
  /** PHASE.md body content */
  content: string;
  /** Model override for this phase (resolved from frontmatter) */
  model?: ModelRef;
  /** Do not automatically inject this Phase into the model route catalog/context. */
  disableAutoInvocation?: boolean;
  /** Do not expose this Phase to direct user invocation. */
  disableImplicitInvocation?: boolean;
  /** ExtensionAPI factory function (default export pattern) */
  factory?: (api: ExtensionAPI) => Promise<void>;
  /** Direct run function */
  run?: (context: PhaseContext, execution: PhaseExecution) => Promise<PhaseOutput | void>;
}

/**
 * Phase registry containing all loaded phases
 */
export interface PhaseRegistry {
  /** Map of phase name to Phase object */
  phases: Map<string, Phase>;
  /** Entry phase name (null until Agent applies its default phase) */
  entryPhaseId: string | null;
}
