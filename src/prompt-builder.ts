import type { AgentMessage, LlmContext, ModelTraceMessage, Tool } from "./types";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type OpenAICompatiblePrompt = {
  messages: ChatMessage[];
  traceMessages: ModelTraceMessage[];
};

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

function toConversationMessage(message: AgentMessage): ChatMessage | undefined {
  if (message.role === "system") {
    return undefined;
  }

  if (message.role === "tool") {
    const toolName = typeof message.metadata?.toolName === "string" ? ` (${message.metadata.toolName})` : "";
    return {
      role: "user",
      content: `Tool result${toolName}:\n${message.content}`,
    };
  }

  return {
    role: message.role,
    content: message.content,
  };
}

function buildConversationMessages(context: LlmContext): ChatMessage[] {
  return context.session.messages.flatMap((message) => {
    const chatMessage = toConversationMessage(message);
    return chatMessage ? [chatMessage] : [];
  });
}

function buildPlanPrompt(context: Extract<LlmContext, { phase: "plan" }>, tools: Tool[]): string {
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
    toJson(serializeSkills(context)),
    "",
    "Available tools with name, description, and parameters:",
    toJson(serializeTools(tools)),
  ].join("\n");
}

function buildExecutePrompt(context: Extract<LlmContext, { phase: "execute" }>, tools: Tool[]): string {
  const allowedToolNames = new Set(context.task.toolNames);
  const allowedTools = serializeTools(tools).filter((tool) => allowedToolNames.has(tool.name));

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
  ].join("\n");
}

function buildVerifyPrompt(context: Extract<LlmContext, { phase: "verify" }>): string {
  return [
    "Phase: verify",
    "",
    "JSON-only contract: output exactly a VerificationResult object with a user-visible `message` string.",
    "The message must be preserved before the verification result is recorded.",
    "VerificationResult fields: passed, message, evidence, failedCriteria.",
    "Evaluate the task against the acceptance criteria using the toolResults and the conversation messages already included in this request.",
    "",
    "Task:",
    toJson(context.task),
    "",
    "Acceptance criteria:",
    toJson(context.criteria),
    "",
    "Existing toolResults:",
    toJson(context.toolResults),
  ].join("\n");
}

function buildPhasePromptMessage(context: LlmContext, tools: Tool[]): ChatMessage {
  if (context.phase === "plan") {
    return { role: "user", content: buildPlanPrompt(context, tools) };
  }

  if (context.phase === "execute") {
    return { role: "user", content: buildExecutePrompt(context, tools) };
  }

  return { role: "user", content: buildVerifyPrompt(context) };
}

function toPromptTraceMessage(context: LlmContext, message: ChatMessage): ModelTraceMessage {
  return {
    role: message.role,
    content: message.content,
    metadata: {
      kind: "model_prompt",
      phase: context.phase,
      source: "prompt_builder",
    },
  };
}

export function buildOpenAICompatiblePrompt(input: {
  context: LlmContext;
  tools?: Tool[];
}): OpenAICompatiblePrompt {
  const tools = input.tools ?? [];
  const phasePromptMessage = buildPhasePromptMessage(input.context, tools);

  return {
    messages: [
      buildSystemMessage(input.context),
      ...buildConversationMessages(input.context),
      phasePromptMessage,
    ],
    traceMessages: [toPromptTraceMessage(input.context, phasePromptMessage)],
  };
}

export function buildOpenAICompatibleMessages(input: {
  context: LlmContext;
  tools?: Tool[];
}): ChatMessage[] {
  return buildOpenAICompatiblePrompt(input).messages;
}
