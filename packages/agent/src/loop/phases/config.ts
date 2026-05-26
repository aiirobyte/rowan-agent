import type {
  AgentEvent,
  AgentLimitUsage,
  AgentMessage,
  AgentState,
  LoopPhase,
  LoopPhaseOutputMap,
  Outcome,
  RunThread,
  Task,
  ToolCall,
  ToolResult,
} from "../../types";
import type { AgentRunState } from "../types";

export type PhaseTransition =
  | { type: "next"; phaseId: string }
  | { type: "stop"; outcome: Outcome }
  | { type: "abort"; outcome: Outcome };

export type PhaseDefinition<TInput = unknown, TOutput = unknown> = {
  id: string;
  name: string;
  description: string;
  run(context: PhaseContext, input: TInput): Promise<TOutput>;
};

export type PhaseImplementation<TInput = unknown, TOutput = unknown> = Pick<
  PhaseDefinition<TInput, TOutput>,
  "run"
>;

export type AgentPhasePlugin = {
  id: string;
  entryPhaseId?: string;
  phases: PhaseDefinition<any, any>[];
};

export type CollectedModelOutput<TPhase extends LoopPhase> = {
  text: string;
  phaseOutput?: LoopPhaseOutputMap[TPhase];
  structured?: unknown;
  toolCalls: ToolCall[];
};

export type PhaseContext = {
  phaseId: string;
  state: AgentRunState;
  messages: {
    visible(): AgentMessage[];
    append(message: AgentMessage): Promise<void>;
    appendState(message: AgentMessage): Promise<void>;
  };
  model: {
    collect<TPhase extends LoopPhase>(input: {
      phase: TPhase;
      payload: any;
      recordText?: boolean;
    }): Promise<CollectedModelOutput<TPhase>>;
  };
  tools: {
    execute(input: { task: Task; toolCall: ToolCall }): Promise<ToolResult>;
  };
  runs: {
    create: RunThread;
  };
  skills: AgentState["skills"];
  emit(event: AgentEvent): Promise<void>;
  consumeLimit(resource: keyof AgentLimitUsage): void;
  maxAttempts?: number;
  signal?: AbortSignal;
  incrementAttempt(): void;
  setTask(task: Task | undefined): void;
  setLastExecuteText(text: string): void;
  availablePhases: Array<{ id: string; name: string; description: string }>;
};

export type AgentPhaseConfig = {
  entryPhaseId: string;
  phases: PhaseDefinition<any, any>[];
};

export type AgentPhaseConfigInput = {
  entryPhaseId?: string;
  phases?: PhaseDefinition<any, any>[];
  plugins?: AgentPhasePlugin[];
};

export function definePhase<TInput = unknown, TOutput = unknown>(
  definition: PhaseDefinition<TInput, TOutput>,
): PhaseDefinition<TInput, TOutput> {
  return definition;
}

export function definePhasePlugin(plugin: AgentPhasePlugin): AgentPhasePlugin {
  return plugin;
}

export function validatePhaseConfig(config: AgentPhaseConfig): void {
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

export function createAgentPhaseConfig(input: AgentPhaseConfigInput): AgentPhaseConfig {
  const phases: PhaseDefinition<any, any>[] = [];
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
  const config: AgentPhaseConfig = {
    entryPhaseId: input.entryPhaseId ?? pluginEntryPhaseId ?? phases[0]?.id ?? "",
    phases,
  };
  validatePhaseConfig(config);
  return config;
}

export function resolvePhase(config: AgentPhaseConfig, phaseId: string): PhaseDefinition | undefined {
  return config.phases.find((phase) => phase.id === phaseId);
}

export const DEFAULT_PHASE_ID = "chat";

export function createDefaultAgentPhaseConfig(): AgentPhaseConfig {
  return {
    entryPhaseId: DEFAULT_PHASE_ID,
    phases: [{
      id: DEFAULT_PHASE_ID,
      name: "Chat",
      description: "Decide whether to answer directly or transition to another available phase.",
      run: async () => undefined,
    }],
  };
}