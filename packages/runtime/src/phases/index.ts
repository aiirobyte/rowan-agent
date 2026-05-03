import type { LlmPhase } from "../types";
import type { RuntimePhaseDefinition } from "./types";
import { verifyingPhase } from "./verifying";

export { hasExplicitToolRequest, scheduleTaskRouting } from "./routing";
export type { TaskRoutingScheduleInput } from "./routing";
export { verifyingPhase, verifyTask } from "./verifying";
export type {
  RuntimePhaseDefinition,
  RuntimePhaseModule,
  RuntimePhaseRunner,
  RuntimePhaseState,
} from "./types";

export const runtimePhases = {
  route: {
    phase: "route",
    state: "routing",
    label: "Route request",
  },
  plan: {
    phase: "plan",
    state: "planning",
    label: "Plan task",
  },
  execute: {
    phase: "execute",
    state: "executing",
    label: "Execute task",
  },
  verify: verifyingPhase,
} as const satisfies Record<LlmPhase, RuntimePhaseDefinition>;

export function getRuntimePhase(phase: LlmPhase): RuntimePhaseDefinition {
  return runtimePhases[phase];
}
