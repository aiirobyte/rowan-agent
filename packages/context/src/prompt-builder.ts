import type { LlmContext, Tool } from "@rowan-agent/agent";
import { isConversationMessage, latestUserInput, type AgentMessage } from "@rowan-agent/session";
import {
  buildExecutePrompt,
  buildPlanPrompt,
  buildRoutePrompt,
  buildSystemPrompt,
  buildVerifyPrompt,
} from "./prompt";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type OpenAICompatiblePrompt = {
  messages: ChatMessage[];
  phasePromptMessage: ChatMessage;
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
  return { role: "system", content: buildSystemPrompt(context.session.systemPrompt) };
}

function toConversationMessage(message: AgentMessage): ChatMessage | undefined {
  if (!isConversationMessage(message)) {
    return undefined;
  }

  if (message.role !== "user" && message.role !== "assistant") {
    return undefined;
  }

  return {
    role: message.role,
    content: message.content,
  };
}

function conversationForPhase(context: LlmContext): AgentMessage[] {
  const conversation = context.session.messages.filter(isConversationMessage);

  if (context.phase === "route") {
    return conversation.slice(-12);
  }

  if (context.phase === "plan") {
    return conversation.slice(-20);
  }

  return conversation.slice(-8);
}

function buildConversationMessages(context: LlmContext): ChatMessage[] {
  return conversationForPhase(context).flatMap((message) => {
    const chatMessage = toConversationMessage(message);
    return chatMessage ? [chatMessage] : [];
  });
}

function buildPhasePlanPrompt(context: Extract<LlmContext, { phase: "plan" }>, tools: Tool[]): string {
  return buildPlanPrompt({
    currentUserInputJson: toJson(latestUserInput(context.session)),
    sessionInputJson: toJson(context.session.input),
    sessionTaskJson: toJson(context.session.task ?? null),
    sessionGoalJson: toJson(context.session.goal ?? null),
    runtimeDepthJson: toJson(context.runtime ?? null),
    loadedSkillsJson: toJson(serializeSkills(context)),
    availableToolsJson: toJson(serializeTools(tools)),
  });
}

function buildPhaseRoutePrompt(context: Extract<LlmContext, { phase: "route" }>, tools: Tool[]): string {
  return buildRoutePrompt({
    currentUserInputJson: toJson(latestUserInput(context.session)),
    sessionInputJson: toJson(context.session.input),
    sessionTaskJson: toJson(context.session.task ?? null),
    sessionGoalJson: toJson(context.session.goal ?? null),
    runtimeDepthJson: toJson(context.runtime ?? null),
    loadedSkillsJson: toJson(serializeSkills(context)),
    availableToolsJson: toJson(serializeTools(tools)),
  });
}

function buildPhaseExecutePrompt(context: Extract<LlmContext, { phase: "execute" }>, tools: Tool[]): string {
  const allowedToolNames = new Set(context.task.toolNames);
  const allowedTools = serializeTools(tools).filter((tool) => allowedToolNames.has(tool.name));

  return buildExecutePrompt({
    taskJson: toJson(context.task),
    allowedToolNamesJson: toJson(context.task.toolNames),
    allowedToolsJson: toJson(allowedTools),
    toolResultsJson: toJson(context.toolResults),
  });
}

function buildPhaseVerifyPrompt(context: Extract<LlmContext, { phase: "verify" }>): string {
  return buildVerifyPrompt({
    taskJson: toJson(context.task),
    criteriaJson: toJson(context.criteria),
    taskOutputJson: toJson(context.taskOutput),
  });
}

function buildPhasePromptMessage(context: LlmContext, tools: Tool[]): ChatMessage {
  if (context.phase === "route") {
    return { role: "user", content: buildPhaseRoutePrompt(context, tools) };
  }

  if (context.phase === "plan") {
    return { role: "user", content: buildPhasePlanPrompt(context, tools) };
  }

  if (context.phase === "execute") {
    return { role: "user", content: buildPhaseExecutePrompt(context, tools) };
  }

  return { role: "user", content: buildPhaseVerifyPrompt(context) };
}

export function buildOpenAICompatiblePrompt(input: {
  context: LlmContext;
  tools?: Tool[];
}): OpenAICompatiblePrompt {
  const tools = input.tools ?? [];
  const phasePromptMessage = buildPhasePromptMessage(input.context, tools);

  return {
    phasePromptMessage,
    messages: [
      buildSystemMessage(input.context),
      ...buildConversationMessages(input.context),
      phasePromptMessage,
    ],
  };
}

export function buildOpenAICompatibleMessages(input: {
  context: LlmContext;
  tools?: Tool[];
}): ChatMessage[] {
  return buildOpenAICompatiblePrompt(input).messages;
}
