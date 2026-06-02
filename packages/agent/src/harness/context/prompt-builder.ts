import type { AgentContextMessage, AgentContextSkill } from "../../protocol";
import { isConversationMessage } from "../../protocol/context";
import type { PhaseInput } from "../../loop/phases/registry";
import type { LlmRequest, LlmMessage, LlmModelRef, LlmContentPart } from "@rowan-agent/models";
import {
  buildSystemPrompt,
} from "./prompt";

export type PromptTool = { name: string; description: string; parameters: unknown };

export type SerializableTool = {
  name: string;
  description: string;
  parameters: unknown;
};

// ---------------------------------------------------------------------------
// Internal utilities
// ---------------------------------------------------------------------------

function summarizeText(text: string, maxLength = 700): string {
  const compact = text.trim().replace(/\s+/g, " ");
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 3)}...` : compact;
}

export function serializeSkills(skills: AgentContextSkill[]): unknown[] {
  return skills.map((skill) => ({
    id: skill.id,
    path: skill.path,
    toolNames: skill.toolNames ?? [],
    summary: summarizeText(skill.content),
  }));
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

export function conversationMessages(messages: AgentContextMessage[]): LlmMessage[] {
  return messages.flatMap((message): LlmMessage[] => {
    // Conversation-scoped user messages
    if (message.role === "user" && isConversationMessage(message)) {
      return [{ role: "user", content: message.content }];
    }

    // Conversation-scoped assistant messages (without tool calls)
    if (message.role === "assistant" && isConversationMessage(message)) {
      const toolCalls = message.metadata?.toolCalls as Array<{ id: string; name: string; args: unknown }> | undefined;
      if (!toolCalls?.length) {
        return [{ role: "assistant", content: message.content }];
      }
      // Fall through to tool message handling below
    }

    // Tool-related messages (any scope) — include for native tool_call format
    if (message.role === "assistant" && Array.isArray(message.metadata?.toolCalls)) {
      const toolCalls = message.metadata.toolCalls as Array<{ id: string; name: string; args: unknown }>;
      const content: LlmContentPart[] = [];
      if (message.content) {
        content.push({ type: "text", text: message.content });
      }
      for (const tc of toolCalls) {
        content.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.args });
      }
      return [{ role: "assistant", content }];
    }

    if (message.role === "tool") {
      const toolCallId = (message.metadata?.toolCallId as string) ?? "";
      const isError = message.metadata?.isError as boolean | undefined;
      const content: LlmContentPart[] = [
        { type: "tool_result", toolUseId: toolCallId, content: message.content, isError },
      ];
      return [{ role: "tool", content }];
    }

    // Skip execution-scoped non-tool messages (model messages, routing decisions, etc.)
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
  let systemText = buildSystemPrompt({ systemPrompt: input.systemPrompt });

  if (input.skills.length > 0) {
    systemText += "\n\nLoaded skills:\n" + JSON.stringify(serializeSkills(input.skills));
  }

  const messages: LlmMessage[] = [...conversationMessages(input.messages)];

  const tools = input.tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));

  return {
    model: options?.model ?? { provider: "", name: "" },
    system: systemText,
    messages,
    tools: tools.length > 0 ? tools : undefined,
  };
}
