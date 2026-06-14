import type { LlmRequest } from "@rowan-agent/models";
import type { AgentContext } from "../../types";
import type { PhaseInput, PhaseOutput } from "../../protocol/context";
import type { PhaseExecution } from "../../loop/execution";
import type { WorkspacePaths } from "../env/path";
import type { ExtensionAPI } from "./extension-api";

/**
 * Frontmatter properties parsed from PHASE.md
 */
export interface PhaseFrontmatter {
  /** Phase unique identifier (required) */
  id: string;
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
  /** Is this the entry phase */
  entry?: boolean;
  /** Forced next phase id */
  target?: string;
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
  entry: boolean;
  target?: string;
  filePath?: string;
  baseDir?: string;
  content: string;
  buildPrompt: () => string;
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
  /** Is entry phase */
  entry: boolean;
  /** Forced next phase */
  target?: string;
  /** Path to PHASE.md file */
  filePath: string;
  /** Phase directory path */
  baseDir: string;
  /** PHASE.md body content */
  content: string;
  /** Build prompt from phase definition */
  buildPrompt: () => string;
  /** Custom LLM request builder (for extension-registered phases) */
  buildLlmRequest?: (input: PhaseInput) => LlmRequest;
  /** Optional execution function */
  run?: (context: AgentContext, execution: PhaseExecution) => Promise<PhaseOutput | void>;
}

/**
 * Built-in phase sentinel states
 * These are NOT executable phases, just type-level markers
 */
export type PhaseState = "none" | "stop";

/**
 * Result of phase transition decision
 */
export interface PhaseTransition {
  /** Next phase id or sentinel state */
  nextPhase: string | PhaseState;
  /** Reason for transition */
  reason?: string;
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

/**
 * Phase loading options
 */
export interface PhaseLoadOptions {
  /** Base directory to search for phases */
  baseDir?: string;
  /** Workspace paths for resolution */
  workspace?: WorkspacePaths;
}
