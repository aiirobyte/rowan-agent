import type {
  AgentMessage,
  AgentState,
  Outcome,
  Skill,
  Tool,
} from "../../types";
import type { ToolCall, ToolResult } from "../../types";
import { createId } from "../../utils";
import type { ContentBlock, LlmRequest, LlmToolChoice } from "@rowan-agent/models";
import type { PhaseOutput } from "../../protocol/context";
import type { AgentRunState } from "../types";

export { createId };
export type { Outcome, ToolCall, ToolResult };
export type { LlmToolChoice };

export type { PhaseOutput };

/** Unified phase input — contains everything the model needs. */
export type PhaseInput = {
  phase: string;
  systemPrompt: string;
  messages: AgentMessage[];
  /** All tools (for systemPrompt display, cache-friendly) */
  tools: Tool[];
  /** All skills (for systemPrompt display) */
  skills: Skill[];
  /** Phase-specific filtered tools (for LlmRequest.tools) */
  phaseTools?: Tool[];
  /** Phase-specific filtered skills */
  phaseSkills?: Skill[];
  /** Additional guideline bullets appended to the system prompt. */
  promptGuidelines?: string[];
  /** Text to append after the system prompt. */
  appendSystemPrompt?: string;
  /** Tool choice configuration from phase definition */
  toolChoice?: LlmToolChoice;
};

/** Minimal phase manifest for registry operations. */
export type PhaseManifest = {
  id: string;
  name: string;
  description: string;
  /** Tools available in this phase. If omitted, all tools are available. */
  tools?: string[];
  /** Skills available in this phase. If omitted, all skills are available. */
  skills?: string[];
};

export type PhaseDefinition = PhaseManifest & {
  run?: PhaseRun;
  buildPrompt?(input: PhaseInput): LlmRequest;
};

export type PhaseRun = (context: PhaseContext, input: PhaseInput) => Promise<PhaseOutput | void>;

export type ModelInvokeOutput = {
  text: string;
  contentBlocks: ContentBlock[];
  toolCalls: ToolCall[];
  stopReason?: string;
};

export type ModelInvokeInput = {
  input: PhaseInput;
  /** Auto-execute tools and record results to message history */
  autoExecuteTools?: boolean;
  /** Max tool execution rounds (default: 10) */
  maxToolRounds?: number;
  /** Tool names to exclude from auto-execution (e.g. ["route"]) */
  excludeTools?: string[];
};

/** Message lifecycle manager for streaming updates */
/** Snapshot of message state, used for restore */
export type MessageSnapshot = {
  transcriptLength: number;
  stateMessagesLength: number;
};

export type PhaseMessageManager = {
  /** Get all visible messages in the transcript */
  visible(): AgentMessage[];
  /** Start a new message stream, returns message id */
  start(role: "assistant" | "tool", content: string, metadata?: Record<string, unknown>): string;
  /** Stream a text delta */
  update(messageId: string, delta: string): Promise<void>;
  /** End the message stream, appends to transcript */
  end(messageId: string): Promise<void>;
  /** Delete a single message by id or index */
  delete(target: string | number): void;
  /** Insert a message before a target (by id or index) */
  insert(target: string | number, message: AgentMessage): void;
  /** Clear all messages from transcript and state */
  clear(): void;
  /** Capture current message state for later restore */
  snapshot(): MessageSnapshot;
  /** Restore message state to a previous snapshot, discarding messages added after it */
  restore(snap: MessageSnapshot): void;
};

/** Tool execution lifecycle manager */
export type PhaseToolExecutionManager = {
  /** Start tool execution */
  start(toolCallId: string, toolName: string, args: unknown): Promise<void>;
  /** Update tool execution progress */
  update(toolCallId: string, partialResult: unknown): Promise<void>;
  /** End tool execution */
  end(toolCallId: string, toolName: string, result: ToolResult, isError: boolean): Promise<void>;
};

export type PhaseContext = {
  phaseId: string;
  state: AgentRunState;
  messages: PhaseMessageManager;
  toolExecution: PhaseToolExecutionManager;
  model: {
    invoke(input: ModelInvokeInput): Promise<ModelInvokeOutput>;
  };
  tools: {
    execute(input: { toolCall: ToolCall }): Promise<ToolResult>;
  };
  skills: AgentState["skills"];
  turn<T>(fn: () => Promise<T>): Promise<T>;
  maxAttempts?: number;
  incrementAttempt(): void;
  availablePhases: Array<{ id: string; name: string; description: string }>;
  /** Extract route decision from tool calls. Returns undefined if no route tool call found. */
  routeDecision(toolCalls: ToolCall[]): { route: string; reason?: string } | undefined;
};

export type PhaseRegistry = {
  entryPhaseId: string;
  phases: PhaseDefinition[];
};

export type PhaseRegistryInput = {
  entryPhaseId?: string;
  phases?: PhaseDefinition[];
};

function validatePhaseRegistry(registry: PhaseRegistry): void {
  if (!registry.entryPhaseId || registry.entryPhaseId.trim().length === 0) {
    throw new Error("Phase registry must have a non-empty entryPhaseId.");
  }

  if (!Array.isArray(registry.phases) || registry.phases.length === 0) {
    throw new Error("Phase registry must include at least one phase definition.");
  }

  const ids = new Set<string>();
  for (const phase of registry.phases) {
    if (!phase.id || phase.id.trim().length === 0) {
      throw new Error("Each phase definition must have a non-empty id.");
    }
    if (ids.has(phase.id)) {
      throw new Error(`Duplicate phase id: ${phase.id}`);
    }
    ids.add(phase.id);
  }

  if (!ids.has(registry.entryPhaseId)) {
    throw new Error(`Entry phase id "${registry.entryPhaseId}" is not defined in phases.`);
  }
}

export function createPhaseRegistry(input: PhaseRegistryInput): PhaseRegistry {
  const phases: PhaseDefinition[] = [...(input.phases ?? [])];

  const registry: PhaseRegistry = {
    entryPhaseId: input.entryPhaseId ?? phases[0]?.id ?? "",
    phases,
  };
  validatePhaseRegistry(registry);
  return registry;
}

/** Look up a phase definition by id; throws if not found. */
export function resolvePhaseEntry(
  registry: PhaseRegistry,
  phaseId: string,
): PhaseDefinition {
  const phase = registry.phases.find((p) => p.id === phaseId);
  if (!phase) {
    throw new Error(`Phase "${phaseId}" is not defined in the phase registry.`);
  }
  return phase;
}

/** Validate and return a phase registry — idempotent, safe for externally-provided registries. */
export function ensurePhaseRegistry(registry: PhaseRegistry): PhaseRegistry {
  validatePhaseRegistry(registry);
  return registry;
}
