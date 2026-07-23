import type { Phase } from "./types";

export const DEFAULT_PHASE_ID = "default";

export function createDefaultPhase(): Phase {
  return {
    name: DEFAULT_PHASE_ID,
    description: "Executes concrete task operations and produces artifacts.",
    filePath: "",
    baseDir: "",
    content: "Execute tasks using current context.\nNo planning. No evaluation.\nRoute to next phase or stop when done.",
  };
}
