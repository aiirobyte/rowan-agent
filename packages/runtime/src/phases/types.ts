import type { LlmPhase } from "../types";

export type RuntimePhaseState = "routing" | "planning" | "executing" | "verifying";

export type RuntimePhaseDefinition<TPhase extends LlmPhase = LlmPhase> = {
  phase: TPhase;
  state: RuntimePhaseState;
  label: string;
};

export type RuntimePhaseRunner<TInput, TOutput> = (input: TInput) => Promise<TOutput>;

export type RuntimePhaseModule<TPhase extends LlmPhase, TInput, TOutput> =
  RuntimePhaseDefinition<TPhase> & {
    run: RuntimePhaseRunner<TInput, TOutput>;
  };
