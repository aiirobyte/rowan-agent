import type { AgentContextMessage, LlmContext, ToolDefinition } from "../../protocol";
import { buildChatPrompt } from "../../loop/phases/chat/prompt";
import { buildExecutePrompt } from "../../loop/phases/execute/prompt";
import { buildPlanPrompt } from "../../loop/phases/plan/prompt";
import { buildVerifyPrompt } from "../../loop/phases/verify/prompt";
import {
  buildSystemPrompt,
} from "./prompt";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type PromptTool = ToolDefinition;

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

function serializeTools(tools: PromptTool[] = []): SerializableTool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}

function serializeSkills(context: LlmContext): unknown[] {
  return context.state.skills.map((skill) => ({
    id: skill.id,
    path: skill.path,
    toolNames: skill.toolNames ?? [],
    summary: summarizeText(skill.content),
  }));
}

function buildSystemMessage(context: LlmContext): ChatMessage {
  return { role: "system", content: buildSystemPrompt(context.state.systemPrompt) };
}

function isConversationMessage(message: AgentContextMessage): boolean {
  return message.metadata?.scope === "conversation";
}

function latestUserInput(context: LlmContext): string {
  for (let index = context.state.messages.length - 1; index >= 0; index -= 1) {
    const message = context.state.messages[index];
    if (message.role === "user" && isConversationMessage(message)) {
      return message.content;
    }
  }

  return context.state.input;
}

function toConversationMessage(message: AgentContextMessage): ChatMessage | undefined {
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

function conversationForPhase(context: LlmContext): AgentContextMessage[] {
  const conversation = context.state.messages.filter(isConversationMessage);

  if (context.phase === "chat") {
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

function buildPhasePlanPrompt(context: Extract<LlmContext, { phase: "plan" }>, tools: PromptTool[]): string {
  return buildPlanPrompt({
    currentUserInputJson: toJson(latestUserInput(context)),
    stateInputJson: toJson(context.state.input),
    stateTaskJson: toJson(context.state.task ?? null),
    stateGoalJson: toJson(context.state.goal ?? null),
    runtimeDepthJson: toJson(context.runtime ?? null),
    loadedSkillsJson: toJson(serializeSkills(context)),
    availableToolsJson: toJson(serializeTools(tools)),
  });
}

function buildPhaseChatPrompt(context: Extract<LlmContext, { phase: "chat" }>, tools: PromptTool[]): string {
  return buildChatPrompt({
    currentUserInputJson: toJson(latestUserInput(context)),
    stateInputJson: toJson(context.state.input),
    stateTaskJson: toJson(context.state.task ?? null),
    stateGoalJson: toJson(context.state.goal ?? null),
    runtimeDepthJson: toJson(context.runtime ?? null),
    availablePhasesJson: toJson(context.availablePhases ?? []),
    loadedSkillsJson: toJson(serializeSkills(context)),
    availableToolsJson: toJson(serializeTools(tools)),
  });
}

function buildPhaseExecutePrompt(context: Extract<LlmContext, { phase: "execute" }>, tools: PromptTool[]): string {
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

function buildPhasePromptMessage(context: LlmContext, tools: PromptTool[]): ChatMessage {
  if (context.phase === "chat") {
    return { role: "user", content: buildPhaseChatPrompt(context, tools) };
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
  tools?: PromptTool[];
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
  tools?: PromptTool[];
}): ChatMessage[] {
  return buildOpenAICompatiblePrompt(input).messages;
}
