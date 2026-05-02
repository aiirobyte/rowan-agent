export type BasePromptInput = {
  loadedSkillsJson: string;
  availableToolsJson: string;
};

export type PlanPromptInput = BasePromptInput & {
  currentUserInputJson: string;
  sessionInputJson: string;
  sessionTaskJson: string;
  sessionGoalJson: string;
  runtimeDepthJson: string;
};

export type RoutePromptInput = BasePromptInput & {
  currentUserInputJson: string;
  sessionInputJson: string;
  sessionTaskJson: string;
  sessionGoalJson: string;
  runtimeDepthJson: string;
};

export type ExecutePromptInput = {
  taskJson: string;
  allowedToolNamesJson: string;
  allowedToolsJson: string;
  toolResultsJson: string;
};

export type VerifyPromptInput = {
  taskJson: string;
  criteriaJson: string;
  taskOutputJson: string;
};

export function buildSystemPrompt(systemPrompt: string): string {
  return [
    systemPrompt,
    "You are the Rowan OpenAI-compatible runtime.",
    "Respond with only one valid JSON object. Do not include Markdown fences, prose, comments, or trailing text.",
    "Use double quotes for all JSON keys and strings.",
  ].join("\n\n");
}

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
    "If Session task or Session goal is present, this is a worker thread; prioritize that task/goal over broad delegation.",
    "",
    "Current user request:",
    input.currentUserInputJson,
    "",
    "Session initial input:",
    input.sessionInputJson,
    "",
    "Session task:",
    input.sessionTaskJson,
    "",
    "Session goal:",
    input.sessionGoalJson,
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

export function buildRoutePrompt(input: RoutePromptInput): string {
  return [
    "Phase: route",
    "",
    "JSON-only contract: output exactly an object shaped like `{ \"message\": string, \"route\": \"direct\" | \"task\" | \"thread\", \"thread\"?: { \"prompt\": string, \"task\": string, \"goal\": string } }`.",
    "Default to answering the user directly with route=\"direct\".",
    "For normal chat, greetings, explanations, calculations, summaries, writing, and advice that do not require tools, set route=\"direct\".",
    "When route=\"direct\", message must be the complete final user-visible answer in the user's language.",
    "Set route=\"task\" for ordinary tool-backed work in this runtime, including simple command execution, file reads/writes, workspace inspection, and one-step tool use.",
    "Set route=\"thread\" only when the user explicitly asks to create/delegate to a thread, or when the work is large enough to need an isolated child runtime.",
    "For route=\"thread\", include thread.prompt, thread.task, and thread.goal. The child thread executes and returns an outcome; this runtime verifies whether that outcome satisfies the goal.",
    "Nested worker threads are allowed while runtime threadDepth is below maxThreadDepth. At maxThreadDepth, do not route to another thread; set route=\"task\" instead.",
    "If the user explicitly names an available tool, asks to use bash/shell/terminal, or asks Rowan to inspect or modify the workspace, route must not be \"direct\".",
    "If the user asks a factual question about the current workspace, project, repository, codebase, files, languages, dependencies, configuration, structure, versions, assets, or whether something exists there, route must not be \"direct\".",
    "If your answer would say you cannot know without inspecting the workspace, set route=\"task\" instead of returning that as the final answer.",
    "When route is \"task\" or \"thread\", message is only a concise routing status explaining that tool-backed or thread-backed work is needed.",
    "Do not call tools in this phase; only decide whether a tool-backed task is required.",
    "For route=\"direct\", forbidden message values include \"route\", \"routed\", \"direct\", \"done\", \"ok\", and other status labels.",
    "Route only the current user request below. Use prior conversation only as context.",
    "",
    "Current user request:",
    input.currentUserInputJson,
    "",
    "Session initial input:",
    input.sessionInputJson,
    "",
    "Session task:",
    input.sessionTaskJson,
    "",
    "Session goal:",
    input.sessionGoalJson,
    "",
    "Runtime thread depth:",
    input.runtimeDepthJson,
    "",
    "Example direct response for user `你好`: `{ \"message\": \"你好！有什么我可以帮你？\", \"route\": \"direct\" }`.",
    "Example direct response for user `What is 2 + 2?`: `{ \"message\": \"2 + 2 = 4.\", \"route\": \"direct\" }`.",
    "Example task response for user `使用bash查看当前日期`: `{ \"message\": \"Creating a task to run bash.\", \"route\": \"task\" }`.",
    "Example thread response for user `创建一个thread并让它查看当前日期`: `{ \"message\": \"Creating a thread to run bash.\", \"route\": \"thread\", \"thread\": { \"prompt\": \"使用bash查看当前日期\", \"task\": \"Run bash to check the current date.\", \"goal\": \"Return the current date from bash output.\" } }`.",
    "Do not include a task, toolCalls, Markdown fences, or extra keys.",
    "",
    "Loaded skills summary:",
    input.loadedSkillsJson,
    "",
    "Available tools with name, description, and parameters:",
    input.availableToolsJson,
  ].join("\n");
}

export function buildExecutePrompt(input: ExecutePromptInput): string {
  return [
    "Phase: execute",
    "",
    "JSON-only contract: output exactly an object shaped like `{ \"message\": string, \"toolCalls\": ToolCall[] }`.",
    "The message is a concise user-visible execution status and must be preserved before tool calls are recorded.",
    "ToolCall fields: id, name, args.",
    "If no tool is needed, return `\"toolCalls\": []`.",
    "Do not return a task, plan, verificationResult, or passed in this phase.",
    "If more information is needed, call one or more allowed tools now instead of describing a plan.",
    "Call only tools listed in the task toolNames and allowed tools below.",
    "File and command tool paths are relative to the workspace; use `.` or an empty string for the workspace root, not filesystem `/`.",
    "",
    "Task:",
    input.taskJson,
    "",
    "Allowed tool names:",
    input.allowedToolNamesJson,
    "",
    "Allowed tools with name, description, and parameters:",
    input.allowedToolsJson,
    "",
    "Existing toolResults:",
    input.toolResultsJson,
  ].join("\n");
}

export function buildVerifyPrompt(input: VerifyPromptInput): string {
  return [
    "Phase: verify",
    "",
    "Analyze the task output and return only a JSON judgement.",
    "`passed` is a boolean for whether the task is complete; `message` is the final user-visible task answer.",
    "Use `passed: true` when the task output is sufficient to answer the user's task, even if the answer is negative such as no matching files found.",
    "Use `passed: false` only when required tool calls failed, required information is missing, or the user's task cannot be determined from the available output.",
    "Do not return a task, plan, toolCalls, or instructions for future work in this phase.",
    "Return no extra keys beyond passed and message.",
    "If more information is needed, return passed=false and explain what is missing in message.",
    "Evaluate the task against the acceptance criteria using the task output and the conversation messages already included in this request.",
    "Task output may be direct tool results for a normal task or a child thread output for a delegated thread task.",
    "",
    "Task:",
    input.taskJson,
    "",
    "Acceptance criteria:",
    input.criteriaJson,
    "",
    "Task output:",
    input.taskOutputJson,
  ].join("\n");
}
