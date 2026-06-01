import type { AgentContextMessage, AgentContextSkill, ToolResult } from "../../protocol";
import type { PhaseInput } from "../../loop/phases/registry";
import type { LlmRequest, LlmMessage, LlmModelRef } from "@rowan-agent/models";
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
// Section types for buildPhaseContent
// ---------------------------------------------------------------------------

export type PhaseSection =
  | { type: "instructions"; lines: string[] }
  | { type: "userRequest" }
  | { type: "task" }
  | { type: "taskOutput" }
  | { type: "tools" }
  | { type: "skills" }
  | { type: "custom"; text: string };

// ---------------------------------------------------------------------------
// Internal utilities
// ---------------------------------------------------------------------------

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

export function conversationMessages(messages: AgentContextMessage[]): LlmMessage[] {
  return messages.filter(isConversationMessage).flatMap((message) => {
    if (message.role !== "user" && message.role !== "assistant") return [];
    if (!isConversationMessage(message)) return [];
    return [{ role: message.role, content: message.content }];
  });
}

// ---------------------------------------------------------------------------
// buildModelRequest — builds a complete LlmRequest from PhaseInput
// ---------------------------------------------------------------------------

export function buildModelRequest(
  input: PhaseInput,
  options?: { toolResults?: ToolResult[]; model?: LlmModelRef },
): LlmRequest {
  let systemText = buildSystemPrompt({ systemPrompt: input.systemPrompt });

  if (input.skills.length > 0) {
    systemText += "\n\nLoaded skills:\n" + JSON.stringify(serializeSkills(input.skills));
  }

  const messages: LlmMessage[] = [...conversationMessages(input.messages)];

  if (options?.toolResults?.length) {
    messages.push({
      role: "user",
      content: `Previous tool results:\n${JSON.stringify(options.toolResults, null, 2)}`,
    });
  }

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

// ---------------------------------------------------------------------------
// buildPhaseContent — assembles phase-specific content from sections
// ---------------------------------------------------------------------------

export function buildPhaseContent(input: PhaseInput, sections: PhaseSection[]): string {
  const parts: string[] = [];

  for (const section of sections) {
    switch (section.type) {
      case "instructions":
        parts.push(...section.lines);
        break;
      case "userRequest":
        parts.push("Current user request:", JSON.stringify(latestUserInput(input)));
        break;
      case "task": {
        const task = (input.yield as Record<string, unknown>)?.task;
        parts.push("Task:", JSON.stringify(task ?? null, null, 2));
        break;
      }
      case "taskOutput": {
        const yield_ = input.yield as Record<string, unknown> | undefined;
        const toolResults = (yield_?.toolResults as unknown[]) ?? [];
        parts.push("Task output:", JSON.stringify({ kind: "tools", toolResults }, null, 2));
        break;
      }
      case "tools":
        parts.push(
          "Available tools with name, description, and parameters:",
          JSON.stringify(serializeTools(input.tools), null, 2),
        );
        break;
      case "skills":
        parts.push("Skills:", JSON.stringify(serializeSkills(input.skills), null, 2));
        break;
      case "custom":
        parts.push(section.text);
        break;
    }
    parts.push("");
  }

  return parts.join("\n").trimEnd();
}
