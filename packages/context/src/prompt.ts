export type BasePromptInput = {
  loadedSkillsJson: string;
  availableToolsJson: string;
};

export type PlanPromptInput = BasePromptInput;

export type RoutePromptInput = BasePromptInput;

export type ExecutePromptInput = {
  taskJson: string;
  allowedToolNamesJson: string;
  allowedToolsJson: string;
  toolResultsJson: string;
};

export type VerifyPromptInput = {
  taskJson: string;
  criteriaJson: string;
  toolResultsJson: string;
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
    "Create the task for the user's request in the conversation messages already included in this request.",
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
    "JSON-only contract: output exactly an object shaped like `{ \"message\": string, \"needsTask\": boolean }`.",
    "Default to answering the user directly with needsTask=false.",
    "For normal chat, greetings, explanations, calculations, summaries, writing, and advice that do not require tools, set needsTask=false.",
    "When needsTask=false, message must be the complete final user-visible answer in the user's language.",
    "Set needsTask=true only when satisfying the request requires tools, workspace access, command execution, file inspection or modification, loaded-skill execution, or explicit tool-backed verification.",
    "If the user explicitly names an available tool, asks to use bash/shell/terminal, or asks Rowan to inspect or modify the workspace, needsTask must be true.",
    "When needsTask=true, message is only a concise routing status explaining that a tool-backed task is needed.",
    "Do not call tools in this phase; only decide whether a tool-backed task is required.",
    "For needsTask=false, forbidden message values include \"route\", \"routed\", \"direct\", \"done\", \"ok\", and other status labels.",
    "Example direct response for user `你好`: `{ \"message\": \"你好！有什么我可以帮你？\", \"needsTask\": false }`.",
    "Example direct response for user `What is 2 + 2?`: `{ \"message\": \"2 + 2 = 4.\", \"needsTask\": false }`.",
    "Example task response for user `使用bash查看当前日期`: `{ \"message\": \"Creating a task to run bash.\", \"needsTask\": true }`.",
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
    "Call only tools listed in the task toolNames and allowed tools below.",
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
    "JSON-only contract: output exactly a VerificationResult object with a user-visible `message` string.",
    "The message must be preserved before the verification result is recorded.",
    "VerificationResult fields: passed, message, evidence, failedCriteria.",
    "Use `passed: true` when the toolResults are sufficient to answer the user's task, even if the answer is negative such as no matching files found.",
    "Use `passed: false` only when required tool calls failed, evidence is missing, or the user's task cannot be determined from the available results.",
    "`evidence` must be an array of evidence objects or concise evidence strings.",
    "`failedCriteria` must be an array of failed criterion ids; do not copy whole criterion objects into failedCriteria.",
    "Evaluate the task against the acceptance criteria using the toolResults and the conversation messages already included in this request.",
    "",
    "Task:",
    input.taskJson,
    "",
    "Acceptance criteria:",
    input.criteriaJson,
    "",
    "Existing toolResults:",
    input.toolResultsJson,
  ].join("\n");
}
