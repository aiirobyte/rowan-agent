import type { AgentMessage } from "../../types";

/**
 * Parameters for model chat request
 */
export interface ChatParams {
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
}

/**
 * Result from model chat request
 */
export interface ChatResult {
  content: string;
  stopReason?: "end_turn" | "max_tokens" | "stop_sequence";
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Output returned from phase execution
 */
export interface PhaseOutput {
  /** Message to display */
  message?: string;
  /** Override next phase (lower priority than frontmatter target) */
  nextPhase?: string;
  /** Additional output data */
  [key: string]: unknown;
}

/**
 * Options for internal loop execution
 */
export interface LoopOptions {
  /** Maximum iterations before forced stop */
  maxIterations?: number;
  /** Stop if phase changes during loop */
  stopOnPhaseChange?: boolean;
  /** Custom stop condition */
  shouldStop?: (state: LoopState) => boolean;
}

/**
 * State passed to shouldStop callback
 */
export interface LoopState {
  iteration: number;
  currentPhase: string;
  lastOutput?: unknown;
}

/**
 * Result from internal loop execution
 */
export interface LoopResult {
  /** Number of iterations executed */
  iterations: number;
  /** Phase when loop ended */
  finalPhase: string;
  /** Final output */
  output?: unknown;
  /** Why loop ended */
  reason: "max_iterations" | "phase_change" | "stop_condition" | "natural";
}

/**
 * Agent context for reading state
 */
export interface AgentContext {
  /** Current message history */
  messages: AgentMessage[];
  /** Current phase id */
  currentPhase: string;
  /** All available phase ids */
  availablePhases: string[];
  /** Current turn number */
  turnNumber: number;
}

/**
 * ExtensionAPI - Full API available to phase execution code
 *
 * Phase code in index.ts|js receives this API to:
 * - Make model requests
 * - Execute steps or full loops
 * - Control phase transitions
 * - Read agent state
 * - Register lifecycle hooks
 */
export interface ExtensionAPI {
  /**
   * Model request interface
   */
  model: {
    /**
     * Send chat request to model
     */
    chat(params: ChatParams): Promise<ChatResult>;
  };

  /**
   * Execute a single step/action
   */
  executeStep(action: unknown): Promise<unknown>;

  /**
   * Run internal execution loop
   */
  runLoop(options?: LoopOptions): Promise<LoopResult>;

  /**
   * Set the next phase to transition to.
   * Lower priority than frontmatter target.
   */
  setNextPhase(phaseId: string): void;

  /**
   * Inject additional prompt content into current turn
   */
  injectPrompt(prompt: string): void;

  /**
   * Get current phase id
   */
  getCurrentPhase(): string;

  /**
   * Get phase content (body of PHASE.md)
   */
  getPhaseContent(phaseId: string): string;

  /**
   * Get full agent context
   */
  getContext(): AgentContext;

  /**
   * Register callback for phase entry
   */
  onPhaseEnter(callback: () => void): void;

  /**
   * Register callback for phase exit
   */
  onPhaseExit(callback: () => void): void;
}
