import type { LlmContentPart } from "@rowan-agent/models";
import type { AgentMessage, AgentContext, Tool as LoopTool, ToolResult } from "../types";
import type { AgentDefinitionContext, Tool as DurableTool } from "./contracts";
import type {
  AgentId,
  AssistantContent,
  AssistantMessage,
  JsonValue,
  Message,
  RunId,
  UserContent,
} from "../runtime-events";
import { isJsonValue } from "./json";

/** Project durable Runtime messages and tools into the loop's provider-facing context. */
export function projectModelContext(input: {
  context: AgentDefinitionContext;
  messages: readonly Message[];
  agentId: AgentId;
  runId: RunId;
}): AgentContext {
  return {
    systemPrompt: input.context.systemPrompt,
    messages: input.messages.map(projectMessage),
    tools: input.context.tools.map((tool) => projectTool(tool, input.agentId, input.runId)),
    skills: [...input.context.skills],
    ...(input.context.phases ? { phases: input.context.phases } : {}),
  };
}

/** Convert the loop's final assistant message back into a durable Runtime message. */
export function projectAssistantMessage(
  message: AgentMessage,
  agentId: AgentId,
  runId: RunId,
  sequenceWithinRun: number,
): AssistantMessage {
  return {
    id: message.id as AssistantMessage["id"],
    agentId,
    runId,
    role: "assistant",
    content: durableAssistantContent(message.content),
    sequenceWithinRun,
    createdAt: message.createdAt,
    ...(message.metadata ? { metadata: message.metadata as never } : {}),
  };
}

function projectMessage(message: Message): AgentMessage {
  switch (message.role) {
    case "user":
      return { id: message.id, role: message.role, content: projectUserContent(message.content), createdAt: message.createdAt, ...(message.metadata ? { metadata: message.metadata as never } : {}) };
    case "assistant":
      return { id: message.id, role: message.role, content: projectAssistantContent(message.content), createdAt: message.createdAt, ...(message.metadata ? { metadata: message.metadata as never } : {}) };
    case "tool":
      return { id: message.id, role: message.role, content: projectToolContent(message.content), createdAt: message.createdAt, ...(message.metadata ? { metadata: message.metadata as never } : {}) };
  }
}

function durableAssistantContent(content: AgentMessage["content"]): AssistantContent {
  if (typeof content === "string") return content;
  type Part = Exclude<AssistantContent, string>[number];
  const projected: Part[] = [];
  for (const part of content) {
    if (part.type === "text") projected.push({ type: "text", text: part.text });
    else if (part.type === "thinking") projected.push({ type: "thinking", thinking: part.thinking, ...(part.signature ? { signature: part.signature } : {}) });
    if (part.type === "tool_use") {
      projected.push({ type: "tool_use", toolCallId: part.id as never, name: part.name, input: isJsonValue(part.input) ? part.input : null });
    }
  }
  return projected;
}

function projectUserContent(content: UserContent): string | LlmContentPart[] {
  if (typeof content === "string") return content;
  return content.map((part) => ({ ...part }));
}

function projectAssistantContent(content: AssistantContent): string | LlmContentPart[] {
  if (typeof content === "string") return content;
  return content.map((part) => {
    if (part.type === "text") return { ...part };
    if (part.type === "thinking") return { ...part };
    return { type: "tool_use", id: part.providerToolCallId ?? part.toolCallId, name: part.name, input: part.input };
  });
}

function projectToolContent(content: Extract<Message, { role: "tool" }>["content"]): LlmContentPart[] {
  return content.map((part) => ({
    type: "tool_result",
    toolUseId: part.providerToolCallId ?? part.toolCallId,
    content: jsonText(part.result.content),
    ...(part.result.ok ? {} : { isError: true }),
  }));
}

export function projectTool(tool: DurableTool, agentId: AgentId, runId: RunId): LoopTool {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    execute: async (args, context, signal): Promise<ToolResult> => {
      const result = await tool.execute(args as JsonValue, {
        agentId,
        runId,
        toolCallId: context.toolCallId as never,
        reportProgress: () => undefined,
      }, signal ?? new AbortController().signal);
      return { toolCallId: context.toolCallId, toolName: tool.name, ...result };
    },
  };
}

function jsonText(value: JsonValue): string {
  return typeof value === "string" ? value : JSON.stringify(value) ?? "null";
}
