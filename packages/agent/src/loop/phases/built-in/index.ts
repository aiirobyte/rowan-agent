import { chatPhaseExtension } from "./chat";
import { executePhaseExtension } from "./execute";
import { planPhaseExtension } from "./plan";
import { verifyPhaseExtension } from "./verify";

export const builtinPhases = [
  chatPhaseExtension,
  planPhaseExtension,
  executePhaseExtension,
  verifyPhaseExtension,
];

export {
  chatPhaseExtension,
  planPhaseExtension,
  executePhaseExtension,
  verifyPhaseExtension,
};
