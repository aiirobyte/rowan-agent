export { chatPhaseDefinition } from "./chat";
export { buildChatPrompt } from "./chat/prompt";
export type { ChatInput } from "./chat/types";
export { executePhaseDefinition } from "./execute";
export { buildExecutePrompt } from "./execute/prompt";
export type { ExecuteInput } from "./execute/types";
export { planPhaseDefinition } from "./plan";
export { buildPlanPrompt } from "./plan/prompt";
export type { PlanInput } from "./plan/types";
export type {
  PhaseContext,
  PhaseDefinition,
  PhaseOutput,
  PhaseTransition,
} from "./types";
export { verifyPhaseDefinition } from "./verify";
export { buildVerifyPrompt } from "./verify/prompt";
export type { VerifyInput } from "./verify/types";

import { chatPhaseDefinition } from "./chat";
import { executePhaseDefinition } from "./execute";
import { planPhaseDefinition } from "./plan";
import { verifyPhaseDefinition } from "./verify";
import type { AgentPhaseConfig } from "../phase-config";

export function createBuiltinPhaseConfig(): AgentPhaseConfig {
  return {
    entryPhaseId: "chat",
    phases: [
      chatPhaseDefinition,
      planPhaseDefinition,
      executePhaseDefinition,
      verifyPhaseDefinition,
    ],
  };
}
