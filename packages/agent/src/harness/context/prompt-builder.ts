import type { AgentContextMessage, AgentContextSkill, ToolResult } from "../../protocol";
import type { PhaseInput } from "../../loop/phases/registry";
import {
  buildSystemPrompt,
} from "./prompt";

export type PromptMessage = { role: "system" | "user" | "assistant"; content: string };
export type PromptTool = { name: string; description: string; parameters: unknown };

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
  input: PhaseInput;
  tools: PromptTool[];
  toolResults?: ToolResult[];
};

export type PhasePromptBuilder = {
  phase: string;
  build(input: PhasePromptBuildInput): string;
};

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

export function serializeSkills(skills: AgentContextSkill[]): unknown[] {
  return skills.map((skill) => ({
    id: skill.id,
    path: skill.path,
    toolNames: skill.toolNames ?? [],
    summary: summarizeText(skill.content),
  }));
}

function buildSystemMessage(systemPrompt: string): PromptMessage {
  return { role: "system", content: buildSystemPrompt({ systemPrompt }) };
}

function isConversationMessage(message: AgentContextMessage): boolean {
  return message.metadata?.scope === "conversation";
}

export function latestUserInput(input: PhaseInput): string {
  for (let index = input.messages.length - 1; index >= 0; index -= 1) {
    const message = input.messages[index];
    if (message.role === "user" && isConversationMessage(message)) {
      return message.content;
    }
  }

  return "";
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

function buildConversationMessages(input: PhaseInput): PromptMessage[] {
  return input.messages.filter(isConversationMessage).flatMap((message) => {
    const chatMessage = toConversationMessage(message);
    return chatMessage ? [chatMessage] : [];
  });
}

export function buildPrompt(input: {
  context: PhaseInput;
  tools?: PromptTool[];
  toolResults?: ToolResult[];
  phasePromptBuilder: PhasePromptBuilder;
}): Prompt {
  const tools = input.tools ?? [];
  const phasePromptMessage: PromptMessage = {
    role: "user",
    content: input.phasePromptBuilder.build({
      input: input.context,
      tools,
      toolResults: input.toolResults,
    }),
  };
  const messages: PromptMessage[] = [
    buildSystemMessage(input.context.systemPrompt),
    ...buildConversationMessages(input.context),
  ];

  if (input.toolResults && input.toolResults.length > 0) {
    messages.push({
      role: "user",
      content: `Previous tool results:\n${JSON.stringify(input.toolResults, null, 2)}`,
    });
  }

  messages.push(phasePromptMessage);

  return {
    phasePromptMessage,
    messages,
  };
}

export function buildMessages(input: {
  context: PhaseInput;
  tools?: PromptTool[];
  toolResults?: ToolResult[];
  phasePromptBuilder: PhasePromptBuilder;
}): PromptMessage[] {
  return buildPrompt(input).messages;
}

export function createPromptBuilder(phasePromptBuilders: PhasePromptBuilder[]): {
  buildPrompt(input: {
    context: PhaseInput;
    tools?: PromptTool[];
    toolResults?: ToolResult[];
  }): Prompt;
  buildMessages(input: {
    context: PhaseInput;
    tools?: PromptTool[];
    toolResults?: ToolResult[];
  }): PromptMessage[];
} {
  const buildersByPhase = new Map<string, PhasePromptBuilder>();
  for (const builder of phasePromptBuilders) {
    if (buildersByPhase.has(builder.phase)) {
      throw new Error(`Duplicate prompt builder registered for phase "${builder.phase}".`);
    }
    buildersByPhase.set(builder.phase, builder);
  }

  function resolvePhasePromptBuilder(phase: string): PhasePromptBuilder {
    const builder = buildersByPhase.get(phase);
    if (!builder) {
      throw new Error(`No prompt builder registered for phase "${phase}".`);
    }

    return builder;
  }

  return {
    buildPrompt(input) {
      return buildPrompt({
        ...input,
        phasePromptBuilder: resolvePhasePromptBuilder(input.context.phase),
      });
    },

    buildMessages(input) {
      return buildMessages({
        ...input,
        phasePromptBuilder: resolvePhasePromptBuilder(input.context.phase),
      });
    },
  };
}
