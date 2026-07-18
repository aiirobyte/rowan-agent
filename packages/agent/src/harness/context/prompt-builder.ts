import type { AgentMessage, Skill } from "../../protocol";
import type { LlmRequest, LlmMessage, ModelRef } from "@rowan-agent/models";
import { buildSystemPrompt } from "./system-prompt";
import { messageContentText } from "../../types";

export type PromptTool = { name: string; description: string; parameters: unknown };

export type SerializableTool = {
  name: string;
  description: string;
  parameters: unknown;
};

// ---------------------------------------------------------------------------
// Internal utilities
// ---------------------------------------------------------------------------

export function serializeSkills(skills: Skill[]): Array<{
  name: string;
  description: string;
  filePath: string;
  disableModelInvocation?: boolean;
}> {
  return skills.map((skill) => ({
    name: skill.name,
    description: skill.description,
    filePath: skill.filePath,
    disableModelInvocation: skill.disableModelInvocation,
  }));
}

export function latestUserInput(messages: AgentMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "user") {
      return messageContentText(message.content);
    }
  }

  return "";
}

export function conversationMessages(messages: AgentMessage[]): LlmMessage[] {
  return messages.flatMap((message): LlmMessage[] => {
    if (message.role === "user") {
      return [{ role: "user", content: message.content }];
    }

    if (message.role === "assistant") {
      return [{ role: "assistant", content: message.content }];
    }

    if (message.role === "tool") {
      return [{ role: "tool", content: message.content }];
    }

    return [];
  });
}

// ---------------------------------------------------------------------------
// buildModelRequest — builds a complete LlmRequest
// ---------------------------------------------------------------------------

/** Input for building an LLM request — generic, not phase-specific. */
type ModelRequestInput = {
  systemPrompt: string;
  messages: AgentMessage[];
  tools: Array<{ name: string; description: string; parameters: unknown; promptSnippet?: string; promptGuidelines?: string[] }>;
  skills: Skill[];
  promptGuidelines?: string[];
  appendSystemPrompt?: string;
};

export function buildModelRequest(
  input: ModelRequestInput,
  options?: { model?: ModelRef },
): LlmRequest {
  const toolMeta = input.tools.map((t) => ({
    name: t.name,
    description: t.description,
    promptSnippet: t.promptSnippet,
    promptGuidelines: t.promptGuidelines,
  }));

  let systemText = buildSystemPrompt({
    systemPrompt: input.systemPrompt,
    tools: toolMeta,
    skills: input.skills.length > 0 ? serializeSkills(input.skills) : undefined,
    promptGuidelines: input.promptGuidelines,
    appendSystemPrompt: input.appendSystemPrompt,
  });

  const messages: LlmMessage[] = [...conversationMessages(input.messages)];

  const modelTools = input.tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));

  return {
    model: options?.model ?? { provider: "", id: "" },
    system: systemText,
    messages,
    tools: modelTools.length > 0 ? modelTools : undefined,
  };
}
