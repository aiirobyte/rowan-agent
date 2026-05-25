export type VerifyPromptInput = {
  taskJson: string;
  criteriaJson: string;
  taskOutputJson: string;
};

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
