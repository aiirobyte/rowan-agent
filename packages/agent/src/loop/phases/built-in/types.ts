import type { AgentLoopRuntime } from "../../../agent-loop";
import type {
  PhaseConfigTemplatePhase,
  PhaseDefinition,
  PhaseTransition,
} from "../config";

export type BuiltinPhaseExtension<TInput = unknown, TOutput = unknown> = {
  manifest: PhaseConfigTemplatePhase;
  definition: PhaseDefinition<TInput, TOutput>;
  buildInput(runtime: AgentLoopRuntime, definition: PhaseDefinition): TInput | Promise<TInput>;
  applyOutput(input: {
    runtime: AgentLoopRuntime;
    definition: PhaseDefinition<TInput, TOutput>;
    phaseInput: TInput;
    phaseOutput: TOutput;
  }): Promise<PhaseTransition>;
};
