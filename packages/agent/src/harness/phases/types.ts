import type { AgentMessage, ModelRef } from "@rowan-agent/models";
import type { Tool, Skill } from "../../types";
import type { PhaseExecution } from "../../loop/execution";
import type { ExtensionAPI } from "../../extensions/api";

/** Unified phase output — model decides routing via route. */
export type PhaseOutput = {
  message: string;
  /** Route to next phase, or "continue" to re-execute current phase, or "stop" to end */
  route: string;
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
  /** Restrict available skills */
  skills?: string[];
  /** Forced next phase name */
  target?: string;
  /** Expected input fields (key → description) */
  input?: Record<string, string>;
  /** If true, phase gets a fresh context (empty messages) when executed in parallel */
  isolated?: boolean;
  /** Model override for this phase (e.g. "anthropic/claude-sonnet-4-20250514" or "gpt-4.1") */
  model?: string;
}

/**
 * Phase static configuration — describes what a phase is, not how it runs.
 */
export interface PhaseConfig {
  name: string;
  description: string;
  tools?: string[];
  skills?: string[];
  target?: string;
  filePath?: string;
  baseDir?: string;
  content: string;
  input?: Record<string, string>;
}

/**
 * Loaded Phase object
 */
export interface Phase {
  /** Unique phase identity and display name. */
  name: string;
  /** Description */
  description: string;
  /** Restricted tools (undefined = all tools available) */
  tools?: string[];
  /** Restricted skills (undefined = all skills available) */
  skills?: string[];
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
