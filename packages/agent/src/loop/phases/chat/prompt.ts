export type ChatPromptInput = {
  currentUserInputJson: string;
  stateInputJson: string;
  stateTaskJson: string;
  stateGoalJson: string;
  runtimeDepthJson: string;
  availablePhasesJson: string;
  loadedSkillsJson: string;
  availableToolsJson: string;
};

export function buildChatPrompt(input: ChatPromptInput): string {
  return [
    "Phase: chat",
    "",
    "JSON-only contract: output exactly an object shaped like `{ \"message\": string, \"route\": \"direct\" | string }`.",
    "Use route=\"direct\" when you can fully answer the user without another loop phase.",
    "Use another route only when it matches one of the available phase ids below.",
    "When route=\"direct\", message must be the complete final user-visible answer in the user's language.",
    "When route is another phase id, message is only a concise routing status.",
    "Do not call tools in this phase; only answer directly or choose the next phase.",
    "If the user asks about the current workspace, repository, files, tools, or commands, route to an available tool-backed phase instead of guessing.",
    "If Agent state task or Agent state goal is present, this is a worker thread; prioritize that task/goal over broad delegation.",
    "Route only the current user request below. Use prior conversation only as context.",
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
    "Available phases:",
    input.availablePhasesJson,
    "",
    "Loaded skills summary:",
    input.loadedSkillsJson,
    "",
    "Available tools with name, description, and parameters:",
    input.availableToolsJson,
  ].join("\n");
}
