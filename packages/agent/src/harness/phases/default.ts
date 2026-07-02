import type { Phase, PhaseRegistry } from "./types";

export const DEFAULT_PHASE_ID = "default";

export function createDefaultPhase(): Phase {
  return {
    id: DEFAULT_PHASE_ID,
    name: "Execution Phase",
    description: "Executes concrete task operations and produces artifacts.",
    filePath: "",
    baseDir: "",
    content: "Execute tasks using current context.\nNo planning. No evaluation.\nRoute to next phase or stop when done.",
  };
}
