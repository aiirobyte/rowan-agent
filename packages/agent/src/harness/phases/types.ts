import type { AgentMessage } from "@rowan-agent/models";
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
  /** Additional guideline bullets appended to the system prompt */
  promptGuidelines?: string[];
  /** Text to append after the system prompt */
  appendSystemPrompt?: string;
}

/**
 * Frontmatter properties parsed from PHASE.md
 */
export interface PhaseFrontmatter {
  /** Display name, defaults to id */
  name?: string;
  /** Phase description */
  description?: string;
  /** Restrict available tools */
  tools?: string[];
  /** Restrict available skills */
  skills?: string[];
  /** Forced next phase id */
  target?: string;
  /** Expected input fields (key → description) */
  input?: Record<string, string>;
  /** If true, phase gets a fresh context (empty messages) when executed in parallel */
  isolated?: boolean;
}

/**
 * Phase static configuration — describes what a phase is, not how it runs.
 */
export interface PhaseConfig {
  id: string;
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
  /** Unique identifier */
  id: string;
  /** Display name */
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
  /** ExtensionAPI factory function (default export pattern) */
  factory?: (api: ExtensionAPI) => Promise<void>;
  /** Legacy run function */
  run?: (context: PhaseContext, execution: PhaseExecution) => Promise<PhaseOutput | void>;
}

/**
 * Phase registry containing all loaded phases
 */
export interface PhaseRegistry {
  /** Map of phase id to Phase object */
  phases: Map<string, Phase>;
  /** Entry phase id (null if no phases defined) */
  entryPhaseId: string | null;
}

