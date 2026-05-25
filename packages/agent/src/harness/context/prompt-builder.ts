import type { AgentContextMessage, LlmContext, ToolDefinition } from "../../protocol";
import {
  buildSystemPrompt,
} from "./prompt";

export type PromptMessage = { role: "system" | "user" | "assistant"; content: string };
export type PromptTool = ToolDefinition;

export type Prompt = {
  messages: PromptMessage[];
  phasePromptMessage: PromptMessage;
};

export type SerializableTool = {
  name: string;
  description: string;
  parameters: unknown;
};

export type PhasePromptBuildInput = {
  context: LlmContext;
  tools: PromptTool[];
};

export type PhasePromptBuilder = {
  phase: LlmContext["phase"];
  conversationLimit?: number;
  build(input: PhasePromptBuildInput): string;
};

export function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function summarizeText(text: string, maxLength = 700): string {
  const compact = text.trim().replace(/\s+/g, " ");
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 3)}...` : compact;
}

export function serializeTools(tools: PromptTool[] = []): SerializableTool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}

export function serializeSkills(context: LlmContext): unknown[] {
  return context.state.skills.map((skill) => ({
    id: skill.id,
    path: skill.path,
    toolNames: skill.toolNames ?? [],
    summary: summarizeText(skill.content),
  }));
}

function buildSystemMessage(context: LlmContext): PromptMessage {
  return { role: "system", content: buildSystemPrompt(context.state.systemPrompt) };
}

function isConversationMessage(message: AgentContextMessage): boolean {
  return message.metadata?.scope === "conversation";
}

export function latestUserInput(context: LlmContext): string {
  for (let index = context.state.messages.length - 1; index >= 0; index -= 1) {
    const message = context.state.messages[index];
    if (message.role === "user" && isConversationMessage(message)) {
      return message.content;
    }
  }

  return context.state.input;
}

function toConversationMessage(message: AgentContextMessage): PromptMessage | undefined {
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

function conversationForPhase(context: LlmContext, conversationLimit: number): AgentContextMessage[] {
  const conversation = context.state.messages.filter(isConversationMessage);
  const limit = Math.max(0, Math.floor(conversationLimit));
  return limit === 0 ? [] : conversation.slice(-limit);
}

function buildConversationMessages(context: LlmContext, conversationLimit: number): PromptMessage[] {
  return conversationForPhase(context, conversationLimit).flatMap((message) => {
    const chatMessage = toConversationMessage(message);
    return chatMessage ? [chatMessage] : [];
  });
}

export function buildPrompt(input: {
  context: LlmContext;
  tools?: PromptTool[];
  phasePromptBuilder: PhasePromptBuilder;
}): Prompt {
  const tools = input.tools ?? [];
  const phasePromptMessage: PromptMessage = {
    role: "user",
    content: input.phasePromptBuilder.build({
      context: input.context,
      tools,
    }),
  };
  const conversationLimit = input.phasePromptBuilder.conversationLimit ?? 8;

  return {
    phasePromptMessage,
    messages: [
      buildSystemMessage(input.context),
      ...buildConversationMessages(input.context, conversationLimit),
      phasePromptMessage,
    ],
  };
}

export function buildMessages(input: {
  context: LlmContext;
  tools?: PromptTool[];
  phasePromptBuilder: PhasePromptBuilder;
}): PromptMessage[] {
  return buildPrompt(input).messages;
}

export function createPromptBuilder(phasePromptBuilders: PhasePromptBuilder[]): {
  buildPrompt(input: {
    context: LlmContext;
    tools?: PromptTool[];
  }): Prompt;
  buildMessages(input: {
    context: LlmContext;
    tools?: PromptTool[];
  }): PromptMessage[];
} {
  const buildersByPhase = new Map<LlmContext["phase"], PhasePromptBuilder>();
  for (const builder of phasePromptBuilders) {
    if (buildersByPhase.has(builder.phase)) {
      throw new Error(`Duplicate prompt builder registered for phase "${builder.phase}".`);
    }
    buildersByPhase.set(builder.phase, builder);
  }

  function resolvePhasePromptBuilder(context: LlmContext): PhasePromptBuilder {
    const builder = buildersByPhase.get(context.phase);
    if (!builder) {
      throw new Error(`No prompt builder registered for phase "${context.phase}".`);
    }

    return builder;
  }

  return {
    buildPrompt(input) {
      return buildPrompt({
        ...input,
        phasePromptBuilder: resolvePhasePromptBuilder(input.context),
      });
    },

    buildMessages(input) {
      return buildMessages({
        ...input,
        phasePromptBuilder: resolvePhasePromptBuilder(input.context),
      });
    },
  };
}
