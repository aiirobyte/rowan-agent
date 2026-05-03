import type { LlmPhase } from "../types";
import type { AgentPhaseDefinition } from "./types";
import { verifyingPhase } from "./verifying";

export { hasExplicitToolRequest, scheduleTaskRouting } from "./routing";
export type { TaskRoutingScheduleInput } from "./routing";
export { verifyingPhase, verifyTask } from "./verifying";
export type {
  AgentPhaseDefinition,
  AgentPhaseModule,
  AgentPhaseRunner,
  AgentPhaseState,
} from "./types";

export const agentPhases = {
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
} as const satisfies Record<LlmPhase, AgentPhaseDefinition>;

export function getAgentPhase(phase: LlmPhase): AgentPhaseDefinition {
  return agentPhases[phase];
}
