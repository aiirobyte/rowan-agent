import type { AgentMessage } from "../../types";
import type { PhaseOutput } from "../../protocol/context";
import type { PhaseExecution } from "../../loop/execution";
import type { ExtensionAPI } from "../../extensions/api";

/** Phase execution context — passed to phase run() function */
export interface PhaseContext {
  systemPrompt: string;
  messages: AgentMessage[];
  currentPhase: string;
  availablePhases: string[];
  turnNumber: number;
  payload?: unknown;
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
  /** Tool choice strategy */
  "tool-choice"?: string;
  /** Forced next phase id */
  target?: string;
  /** Expected input fields (key → description) */
  input?: Record<string, string>;
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
  toolChoice?: string;
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
  /** Tool choice strategy */
  toolChoice?: string;
  /** Forced next phase */
  target?: string;
  /** Expected input fields (key → description) */
  input?: Record<string, string>;
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

