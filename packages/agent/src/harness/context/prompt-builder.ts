import type { AgentContextMessage, AgentContextSkill } from "../../protocol";
import type { PhaseInput } from "../../protocol/context";
import type { LlmRequest, LlmMessage, LlmModelRef } from "@rowan-agent/models";
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

export function serializeSkills(skills: AgentContextSkill[]): Array<{
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

export function latestUserInput(input: PhaseInput): string {
  for (let index = input.messages.length - 1; index >= 0; index -= 1) {
    const message = input.messages[index];
    if (message.role === "user") {
      return messageContentText(message.content);
    }
  }

  return "";
}

export function conversationMessages(messages: AgentContextMessage[]): LlmMessage[] {
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
// buildModelRequest — builds a complete LlmRequest from PhaseInput
// ---------------------------------------------------------------------------

export function buildModelRequest(
  input: PhaseInput,
  options?: { model?: LlmModelRef },
): LlmRequest {
  // Pass only phase-visible tool and skill metadata to the system prompt.
  const visibleToolNames = input.phaseTools ? new Set(input.phaseTools.map((tool) => tool.name)) : undefined;
  const visibleTools = visibleToolNames
    ? input.tools.filter((tool) => visibleToolNames.has(tool.name))
    : input.tools;
  const toolMeta = visibleTools.map((t) => ({
    name: t.name,
    description: t.description,
    promptSnippet: t.promptSnippet,
    promptGuidelines: t.promptGuidelines,
  }));

  let systemText = buildSystemPrompt({
    systemPrompt: input.systemPrompt,
    tools: toolMeta,
    skills: (input.phaseSkills ?? input.skills).length > 0 ? serializeSkills(input.phaseSkills ?? input.skills) : undefined,
    promptGuidelines: input.promptGuidelines,
    appendSystemPrompt: input.appendSystemPrompt,
  });

  const messages: LlmMessage[] = [...conversationMessages(input.messages)];

  // Use phaseTools (filtered) for LlmRequest.tools
  const modelTools = (input.phaseTools ?? input.tools).map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));

  return {
    model: options?.model ?? { provider: "", name: "" },
    system: systemText,
    messages,
    tools: modelTools.length > 0 ? modelTools : undefined,
  };
}
