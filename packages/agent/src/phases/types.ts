import type { LlmPhase } from "../types";

export type AgentPhaseState = "routing" | "planning" | "executing" | "verifying";

export type AgentPhaseDefinition<TPhase extends LlmPhase = LlmPhase> = {
  phase: TPhase;
  state: AgentPhaseState;
  label: string;
};

export type AgentPhaseRunner<TInput, TOutput> = (input: TInput) => Promise<TOutput>;

export type AgentPhaseModule<TPhase extends LlmPhase, TInput, TOutput> =
  AgentPhaseDefinition<TPhase> & {
    run: AgentPhaseRunner<TInput, TOutput>;
  };
