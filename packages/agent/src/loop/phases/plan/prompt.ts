export type PlanPromptInput = {
  currentUserInputJson: string;
  stateInputJson: string;
  stateTaskJson: string;
  stateGoalJson: string;
  runtimeDepthJson: string;
  loadedSkillsJson: string;
  availableToolsJson: string;
};

export function buildPlanPrompt(input: PlanPromptInput): string {
  return [
    "Phase: plan",
    "",
    "JSON-only contract: output exactly an object shaped like `{ \"message\": string, \"task\": Task }`.",
    "The top-level message is the user-visible planning message and is preserved as plain string message content before the task object is recorded.",
    "Task fields: title, instruction, acceptanceCriteria, toolNames, skillIds, status, attempts.",
    "Rowan can fill missing id, status, attempts, skillIds, toolNames, and simple acceptance criteria.",
    "Prefer setting task.status to \"pending\" and task.attempts to 0.",
    "Use toolNames only from the available tools. Use skillIds only from the loaded skills.",
    "Create the task for the current user request below. Use prior conversation only as context.",
    "If Agent state task or Agent state goal is present, this is a worker thread; prioritize that task/goal over broad delegation.",
    "",
    "Current user request:",
    input.currentUserInputJson,
    "",
    "Agent state initial input:",
    input.stateInputJson,
    "",
    "Agent state task:",
    input.stateTaskJson,
    "",
    "Agent state goal:",
    input.stateGoalJson,
    "",
    "Runtime thread depth:",
    input.runtimeDepthJson,
    "",
    "Loaded skills summary:",
    input.loadedSkillsJson,
    "",
    "Available tools with name, description, and parameters:",
    input.availableToolsJson,
  ].join("\n");
}
