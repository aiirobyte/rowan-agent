export type ExecutePromptInput = {
  taskJson: string;
  allowedToolNamesJson: string;
  allowedToolsJson: string;
  toolResultsJson: string;
};

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
    "For bash commands, avoid unescaped backticks inside double-quoted command strings because bash treats them as command substitution; prefer simple commands, single quotes, or here-docs for multi-line scripts.",
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
