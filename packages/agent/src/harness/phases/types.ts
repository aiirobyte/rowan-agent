import type { LlmRequest } from "@rowan-agent/models";
import type { AgentContext } from "../../types";
import type { PhaseInput, PhaseOutput } from "../../protocol/context";
import type { PhaseExecution } from "../../loop/execution";
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
  buildLlmRequest?: (input: PhaseInput) => LlmRequest;
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
  /** Custom LLM request builder (for extension-registered phases) */
  buildLlmRequest?: (input: PhaseInput) => LlmRequest;
  /** Optional execution function */
  run?: (context: AgentContext, execution: PhaseExecution) => Promise<PhaseOutput | void>;
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

