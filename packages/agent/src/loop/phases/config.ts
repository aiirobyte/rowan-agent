import type {
  AgentEvent,
  AgentLimitUsage,
  AgentMessage,
  AgentState,
  Outcome,
  RunThread,
  Skill,
  Tool,
} from "../../types";
import { createId, type ToolCall, type ToolResult } from "../../types";
import type { ContentBlock } from "@rowan-agent/models";
import type { PhaseOutput } from "../../protocol/context";
import type { AgentRunState } from "../types";
import { LimitExceededError } from "../errors";
import { toJson, serializeTools } from "../../harness/context/prompt-builder";

export { createId, LimitExceededError, toJson, serializeTools };
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

export type PhaseDefinition = {
  id: string;
  name: string;
  description: string;
  run(context: PhaseContext, input: PhaseInput): Promise<PhaseOutput>;
};

export type PhasePlugin = {
  id: string;
  entryPhaseId?: string;
  phases: PhaseDefinition[];
};

export type CollectedModelOutput = {
  text: string;
  contentBlocks: ContentBlock[];
  toolCalls: ToolCall[];
  stopReason?: string;
};

export type ModelCollectInput = {
  phase: string;
  input: PhaseInput;
  toolResults?: ToolResult[];
  scope?: "conversation" | "execution";
};

/** Message lifecycle manager for streaming updates */
export type PhaseMessageManager = {
  /** Start a new message stream, returns message id */
  start(role: "assistant" | "tool", content: string, metadata?: Record<string, unknown>): string;
  /** Stream a text delta */
  update(messageId: string, delta: string): Promise<void>;
  /** End the message stream, appends to transcript */
  end(messageId: string): Promise<void>;
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
  messages: {
    visible(): AgentMessage[];
    append(message: AgentMessage): void;
    appendState(message: AgentMessage): void;
  };
  message: PhaseMessageManager;
  toolExecution: PhaseToolExecutionManager;
  model: {
    collect(input: ModelCollectInput): Promise<CollectedModelOutput>;
  };
  tools: {
    execute(input: { toolCall: ToolCall }): Promise<ToolResult>;
  };
  runs: {
    create: RunThread;
  };
  skills: AgentState["skills"];
  emit(event: AgentEvent): void;
  consumeLimit(resource: keyof AgentLimitUsage): void;
  turn<T>(fn: () => Promise<T>): Promise<T>;
  maxAttempts?: number;
  signal?: AbortSignal;
  incrementAttempt(): void;
  setLastExecuteText(text: string): void;
  availablePhases: Array<{ id: string; name: string; description: string }>;
};

export type PhaseConfig = {
  entryPhaseId: string;
  phases: PhaseDefinition[];
};

export type PhaseConfigInput = {
  entryPhaseId?: string;
  phases?: PhaseDefinition[];
  plugins?: PhasePlugin[];
};

export function definePhase(
  definition: PhaseDefinition,
): PhaseDefinition {
  return definition;
}

export function definePhasePlugin(plugin: PhasePlugin): PhasePlugin {
  return plugin;
}

export function validatePhaseConfig(config: PhaseConfig): void {
  if (!config.entryPhaseId || config.entryPhaseId.trim().length === 0) {
    throw new Error("Phase config must have a non-empty entryPhaseId.");
  }

  if (!Array.isArray(config.phases) || config.phases.length === 0) {
    throw new Error("Phase config must include at least one phase definition.");
  }

  const ids = new Set<string>();
  for (const phase of config.phases) {
    if (!phase.id || phase.id.trim().length === 0) {
      throw new Error("Each phase definition must have a non-empty id.");
    }
    if (ids.has(phase.id)) {
      throw new Error(`Duplicate phase id: ${phase.id}`);
    }
    ids.add(phase.id);
  }

  if (!ids.has(config.entryPhaseId)) {
    throw new Error(`Entry phase id "${config.entryPhaseId}" is not defined in phases.`);
  }
}

export function createPhaseConfig(input: PhaseConfigInput): PhaseConfig {
  const phases: PhaseDefinition[] = [];
  const pluginIds = new Set<string>();

  for (const plugin of input.plugins ?? []) {
    if (!plugin.id || plugin.id.trim().length === 0) {
      throw new Error("Each phase plugin must have a non-empty id.");
    }
    if (pluginIds.has(plugin.id)) {
      throw new Error(`Duplicate phase plugin id: ${plugin.id}`);
    }
    pluginIds.add(plugin.id);
    phases.push(...plugin.phases);
  }

  phases.push(...(input.phases ?? []));

  const pluginEntryPhaseId = input.plugins?.find((plugin) => plugin.entryPhaseId)?.entryPhaseId;
  const config: PhaseConfig = {
    entryPhaseId: input.entryPhaseId ?? pluginEntryPhaseId ?? phases[0]?.id ?? "",
    phases,
  };
  validatePhaseConfig(config);
  return config;
}

export function resolvePhase(config: PhaseConfig, phaseId: string): PhaseDefinition | undefined {
  return config.phases.find((phase) => phase.id === phaseId);
}

export const DEFAULT_PHASE_ID = "chat";

export function createDefaultPhaseConfig(): PhaseConfig {
  return {
    entryPhaseId: DEFAULT_PHASE_ID,
    phases: [{
      id: DEFAULT_PHASE_ID,
      name: "Chat",
      description: "Decide whether to answer directly or transition to another available phase.",
      run: async () => ({ message: "", route: "stop" }),
    }],
  };
}