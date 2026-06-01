import type {
  AgentMessage,
  AgentState,
  Outcome,
  RunThread,
  Skill,
  Tool,
} from "../../types";
import type { ToolCall, ToolResult } from "../../types";
import { createId } from "../../utils";
import type { ContentBlock, LlmRequest } from "@rowan-agent/models";
import type { PhaseOutput } from "../../protocol/context";
import type { AgentRunState } from "../types";

export { createId };
export type { Outcome, ToolCall, ToolResult };

export type { PhaseOutput };

/** Unified phase input — contains everything the model needs. */
export type PhaseInput = {
  phase: string;
  systemPrompt: string;
  messages: AgentMessage[];
  tools: Tool[];
  skills: Skill[];
  /** Data from the previous phase's output.yield */
  yield?: unknown;
};

export type PhaseManifest = {
  id: string;
  name: string;
  description: string;
};

export type PhaseRun = (context: PhaseContext, input: PhaseInput) => Promise<PhaseOutput | void>;

export type PhaseDefinition = PhaseManifest & {
  run?: PhaseRun;
};

export type PhaseHandler = {
  buildPrompt?(input: PhaseInput, options?: { toolResults?: ToolResult[] }): LlmRequest;
};

export type ModelCollectedOutput = {
  text: string;
  contentBlocks: ContentBlock[];
  toolCalls: ToolCall[];
  stopReason?: string;
};

export type ModelCollectInput = {
  input: PhaseInput;
  toolResults?: ToolResult[];
  scope?: "conversation" | "execution";
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
    collect(input: ModelCollectInput): Promise<ModelCollectedOutput>;
  };
  tools: {
    execute(input: { toolCall: ToolCall }): Promise<ToolResult>;
  };
  threads: {
    create: RunThread;
  };
  skills: AgentState["skills"];
  turn<T>(fn: () => Promise<T>): Promise<T>;
  maxAttempts?: number;
  incrementAttempt(): void;
  availablePhases: Array<{ id: string; name: string; description: string }>;
};

export type PhaseRegistry = {
  entryPhaseId: string;
  phases: PhaseDefinition[];
  phaseHandlers: Map<string, PhaseHandler>;
};

export type PhaseRegistryInput = {
  entryPhaseId?: string;
  phases?: PhaseDefinition[];
  phaseHandlers?: Map<string, PhaseHandler>;
};

export function definePhase(
  definition: PhaseDefinition,
): PhaseDefinition {
  return definition;
}

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
  const phaseHandlers = new Map<string, PhaseHandler>();

  for (const [id, handler] of input.phaseHandlers ?? []) {
    phaseHandlers.set(id, handler);
  }

  const registry: PhaseRegistry = {
    entryPhaseId: input.entryPhaseId ?? phases[0]?.id ?? "",
    phases,
    phaseHandlers,
  };
  validatePhaseRegistry(registry);
  return registry;
}

/** Look up a phase definition and its handler by id; throws if not found. */
export function resolvePhaseEntry(
  registry: PhaseRegistry,
  phaseId: string,
): { phase: PhaseDefinition; handler: PhaseHandler | undefined } {
  const phase = registry.phases.find((p) => p.id === phaseId);
  if (!phase) {
    throw new Error(`Phase "${phaseId}" is not defined in the phase registry.`);
  }
  const handler = registry.phaseHandlers.get(phaseId);
  return { phase, handler };
}

/** Validate and return a phase registry — idempotent, safe for externally-provided registries. */
export function ensurePhaseRegistry(registry: PhaseRegistry): PhaseRegistry {
  validatePhaseRegistry(registry);
  return registry;
}

export const DEFAULT_PHASE_ID = process.env.ROWAN_DEFAULT_PHASE ?? "chat";
