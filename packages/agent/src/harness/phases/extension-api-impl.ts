import type {
  ExtensionAPI,
  ChatParams,
  ChatResult,
  LoopOptions,
  LoopResult,
  AgentContext,
  PhaseOutput,
} from "./extension-api";
import type { Phase } from "./types";
import type { AgentMessage } from "../../types";

/**
 * Context required to create an ExtensionAPI instance
 */
export interface ExtensionAPIContext {
  /** Current phase being executed */
  phase: Phase;
  /** Current phase ID */
  currentPhaseId: string;
  /** Agent message history */
  messages: unknown[];
  /** All available phase IDs */
  availablePhases: string[];
  /** Model client interface */
  model: ModelClient;
  /** Execute single step function */
  executeStep: (action: unknown) => Promise<unknown>;
  /** Run internal loop function */
  runLoop: (options?: LoopOptions) => Promise<LoopResult>;
  /** Phase registry for content lookup */
  phaseRegistry: Map<string, Phase>;
  /** Current turn number */
  turnNumber: number;
  /** Current system prompt */
  systemPrompt: string;
  /** Skills available for this phase */
  skills: Array<{ name: string; description: string; filePath: string; content: string }>;
  /** Tools available for this phase */
  tools: Array<{ name: string; description: string }>;
}

/**
 * Model client interface
 */
export interface ModelClient {
  chat(params: ChatParams): Promise<ChatResult>;
}

/**
 * Internal state accessible to the loop after phase execution
 */
export interface ExtensionAPIInternals {
  /** Get code-suggested next phase */
  __getNextPhase(): string | undefined;
  /** Get injected prompts */
  __getInjectedPrompts(): string[];
  /** Get registered enter callbacks */
  __getEnterCallbacks(): Array<() => void | Promise<void>>;
  /** Get registered exit callbacks */
  __getExitCallbacks(): Array<() => void | Promise<void>>;
}

/**
 * Create an ExtensionAPI instance for a phase execution.
 *
 * The returned API provides:
 * - Model request capabilities
 * - Execution control
 * - Phase transition control
 * - State reading
 * - Lifecycle hooks
 *
 * Internal state (nextPhase, injectedPrompts, callbacks) is
 * accessible via getter functions for the loop to consume.
 */
export function createExtensionAPI(context: ExtensionAPIContext): ExtensionAPI & ExtensionAPIInternals {
  // Internal state
  let nextPhase: string | undefined;
  const injectedPrompts: string[] = [];
  const enterCallbacks: Array<() => void | Promise<void>> = [];
  const exitCallbacks: Array<() => void | Promise<void>> = [];

  const api: ExtensionAPI & ExtensionAPIInternals = {
    // Model request interface
    model: {
      async chat(params: ChatParams): Promise<ChatResult> {
        return context.model.chat(params);
      },
    },

    // Execute a single step/action
    async executeStep(action: unknown): Promise<unknown> {
      return context.executeStep(action);
    },

    // Run internal execution loop
    async runLoop(options?: LoopOptions): Promise<LoopResult> {
      return context.runLoop(options);
    },

    // Set the next phase to transition to (lower priority than frontmatter target)
    setNextPhase(phaseId: string): void {
      nextPhase = phaseId;
    },

    // Inject additional prompt content into current turn
    injectPrompt(prompt: string): void {
      injectedPrompts.push(prompt);
    },

    // Get current phase id
    getCurrentPhase(): string {
      return context.currentPhaseId;
    },

    // Get phase content (body of PHASE.md)
    getPhaseContent(phaseId: string): string {
      const phase = context.phaseRegistry.get(phaseId);
      return phase?.content ?? "";
    },

    // Get full agent context
    getContext(): AgentContext {
      return {
        messages: context.messages as AgentContext["messages"],
        currentPhase: context.currentPhaseId,
        availablePhases: context.availablePhases,
        turnNumber: context.turnNumber,
      };
    },

    // AgentContext CRUD methods
    getSystemPrompt(): string {
      return context.systemPrompt;
    },

    setSystemPrompt(prompt: string): void {
      context.systemPrompt = prompt;
    },

    getMessages(): AgentMessage[] {
      return context.messages as AgentMessage[];
    },

    addMessage(role: "user" | "assistant" | "system", content: string): void {
      (context.messages as Array<{ role: string; content: string }>).push({ role, content });
    },

    getAvailableTools(): Array<{ name: string; description: string }> {
      return context.tools.map(t => ({ name: t.name, description: t.description }));
    },

    getAvailableSkills(): Array<{ name: string; description: string }> {
      return context.skills.map(s => ({ name: s.name, description: s.description }));
    },

    getSkillContent(skillName: string): string {
      const skill = context.skills.find(s => s.name === skillName);
      return skill?.content ?? "";
    },

    getAvailablePhases(): string[] {
      return context.availablePhases;
    },

    // Register lifecycle callbacks
    onPhaseEnter(callback: () => void): void {
      enterCallbacks.push(callback);
    },

    onPhaseExit(callback: () => void): void {
      exitCallbacks.push(callback);
    },

    // Internal state accessors
    __getNextPhase(): string | undefined {
      return nextPhase;
    },

    __getInjectedPrompts(): string[] {
      return [...injectedPrompts];
    },

    __getEnterCallbacks(): Array<() => void | Promise<void>> {
      return [...enterCallbacks];
    },

    __getExitCallbacks(): Array<() => void | Promise<void>> {
      return [...exitCallbacks];
    },
  };

  return api;
}
