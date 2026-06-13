import type { AgentContextMessage, AgentContextSkill } from "../../protocol";
import type { PhaseInput } from "../../protocol/context";
import type { LlmRequest, LlmMessage, LlmModelRef, LlmContentPart } from "@rowan-agent/models";
import { buildSystemPrompt } from "./system-prompt";

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
}> {
  return skills.map((skill) => ({
    name: skill.name,
    description: skill.description,
    filePath: skill.filePath,
  }));
}

export function latestUserInput(input: PhaseInput): string {
  for (let index = input.messages.length - 1; index >= 0; index -= 1) {
    const message = input.messages[index];
    if (message.role === "user") {
      return message.content;
    }
  }

  return "";
}

export function conversationMessages(messages: AgentContextMessage[]): LlmMessage[] {
  return messages.flatMap((message): LlmMessage[] => {
    // User messages
    if (message.role === "user") {
      return [{ role: "user", content: message.content }];
    }

    // Assistant messages (without tool calls)
    if (message.role === "assistant") {
      // Skip routing decision messages — they are internal, not conversation
      if (message.metadata?.kind === "routing_decision") {
        return [];
      }
      const toolCalls = message.metadata?.toolCalls as Array<{ id: string; name: string; args: unknown }> | undefined;
      if (!toolCalls?.length) {
        return [{ role: "assistant", content: message.content }];
      }
      // Fall through to tool message handling below
    }

    // Tool-related messages — include for native tool_call format
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

    // Skip non-tool assistant messages (model messages, routing decisions, etc.)
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
  // Pass tool metadata to system prompt builder for rich snippets and guidelines
  // Use input.tools (all tools) for systemPrompt display (cache-friendly)
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
