import type { Phase } from "./types";

export const DEFAULT_PHASE_ID = "default";

export function createDefaultPhase(): Phase {
  return {
    name: DEFAULT_PHASE_ID,
    description: "Executes concrete task operations and produces artifacts.",
    filePath: "",
    baseDir: "",
    skills: [],
    content: "Execute tasks using current context.\nNo planning. No evaluation.\nOmit route when more user input is needed. Use route for immediate phase execution, or route(stop) only when the current user request or task is complete and no further user input is needed.",
  };
}
