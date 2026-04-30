import type { LlmContext, Tool } from "./types";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type SerializableTool = {
  name: string;
  description: string;
  parameters: unknown;
};

function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function summarizeText(text: string, maxLength = 700): string {
  const compact = text.trim().replace(/\s+/g, " ");
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 3)}...` : compact;
}

function serializeTools(tools: Tool[] = []): SerializableTool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}

function serializeMessages(context: LlmContext): unknown[] {
  return context.session.messages.map((message) => ({
    role: message.role,
    content: message.content,
    metadata: message.metadata,
  }));
}

function serializeSkills(context: LlmContext): unknown[] {
  return context.session.skills.map((skill) => ({
    id: skill.id,
    path: skill.path,
    toolNames: skill.toolNames ?? [],
    summary: summarizeText(skill.content),
  }));
}

function buildSystemMessage(context: LlmContext): ChatMessage {
  const content = [
    context.session.systemPrompt,
    "You are the Rowan OpenAI-compatible runtime.",
    "Respond with only one valid JSON object. Do not include Markdown fences, prose, comments, or trailing text.",
    "Use double quotes for all JSON keys and strings.",
  ].join("\n\n");

  return { role: "system", content };
}

function buildPlanPrompt(context: Extract<LlmContext, { phase: "plan" }>, tools: Tool[]): string {
  return [
    "Phase: plan",
    "",
    "JSON-only contract: output exactly an object shaped like `{ \"task\": Task }`.",
    "Task fields: id, title, instruction, acceptanceCriteria, toolNames, skillIds, status, attempts.",
    "Set task.status to \"pending\" and task.attempts to 0.",
    "Use toolNames only from the available tools. Use skillIds only from the loaded skills.",
    "",
    "User input:",
    context.session.userInput,
    "",
    "Loaded skills summary:",
    toJson(serializeSkills(context)),
    "",
    "Available tools with name, description, and parameters:",
    toJson(serializeTools(tools)),
    "",
    "Conversation messages:",
    toJson(serializeMessages(context)),
  ].join("\n");
}

function buildExecutePrompt(context: Extract<LlmContext, { phase: "execute" }>, tools: Tool[]): string {
  const allowedToolNames = new Set(context.task.toolNames);
  const allowedTools = serializeTools(tools).filter((tool) => allowedToolNames.has(tool.name));

  return [
    "Phase: execute",
    "",
    "JSON-only contract: output exactly an object shaped like `{ \"message\"?: string, \"toolCalls\": ToolCall[] }`.",
    "ToolCall fields: id, name, args.",
    "If no tool is needed, return `\"toolCalls\": []`.",
    "Call only tools listed in the task toolNames and allowed tools below.",
    "",
    "Task:",
    toJson(context.task),
    "",
    "Allowed tool names:",
    toJson(context.task.toolNames),
    "",
    "Allowed tools with name, description, and parameters:",
    toJson(allowedTools),
    "",
    "Existing toolResults:",
    toJson(context.toolResults),
    "",
    "Conversation messages:",
    toJson(serializeMessages(context)),
  ].join("\n");
}

function buildVerifyPrompt(context: Extract<LlmContext, { phase: "verify" }>): string {
  return [
    "Phase: verify",
    "",
    "JSON-only contract: output exactly a VerificationResult object.",
    "VerificationResult fields: passed, message, evidence, failedCriteria.",
    "Evaluate the task against the acceptance criteria using the toolResults and conversation messages.",
    "",
    "Task:",
    toJson(context.task),
    "",
    "Acceptance criteria:",
    toJson(context.criteria),
    "",
    "Existing toolResults:",
    toJson(context.toolResults),
    "",
    "Conversation messages:",
    toJson(serializeMessages(context)),
  ].join("\n");
}

export function buildOpenAICompatibleMessages(input: {
  context: LlmContext;
  tools?: Tool[];
}): ChatMessage[] {
  const tools = input.tools ?? [];
  const messages = [buildSystemMessage(input.context)];

  if (input.context.phase === "plan") {
    messages.push({ role: "user", content: buildPlanPrompt(input.context, tools) });
    return messages;
  }

  if (input.context.phase === "execute") {
    messages.push({ role: "user", content: buildExecutePrompt(input.context, tools) });
    return messages;
  }

  messages.push({ role: "user", content: buildVerifyPrompt(input.context) });
  return messages;
}
