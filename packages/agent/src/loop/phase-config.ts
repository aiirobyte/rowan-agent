import type {
  AgentLoopContext,
  LlmPhase,
  Outcome,
  RunThread,
} from "../types";
import type { AgentLoopRuntime } from "../loop";

export type AgentPhaseTransition =
  | { type: "next"; phaseId: string }
  | { type: "stop"; outcome: Outcome }
  | { type: "abort"; outcome: Outcome };

export type AgentPhaseDefinition<TInput = unknown, TOutput = unknown> = {
  id: string;
  modelPhase?: LlmPhase;
  buildInput(runtime: AgentLoopRuntime): TInput | Promise<TInput>;
  run?: (context: AgentPhaseContext, input: TInput) => Promise<TOutput>;
  parseOutput?(raw: unknown, input: TInput): TOutput;
  apply?(runtime: AgentLoopRuntime, output: TOutput, input: TInput): Promise<AgentPhaseTransition>;
};

export type AgentPhaseContext = AgentLoopContext & {
  createRun: RunThread;
};

export type AgentPhaseConfig = {
  entryPhaseId: string;
  phases: AgentPhaseDefinition<any, any>[];
};

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

export function resolvePhase(config: AgentPhaseConfig, phaseId: string): AgentPhaseDefinition | undefined {
  return config.phases.find((phase) => phase.id === phaseId);
}

const DEFAULT_PHASE_IDS = ["route", "thread", "plan", "execute", "verify"] as const;

export function createDefaultAgentPhaseConfig(): AgentPhaseConfig {
  return {
    entryPhaseId: "route",
    phases: DEFAULT_PHASE_IDS.map((id) => ({
      id,
      buildInput: () => undefined,
    })),
  };
}
