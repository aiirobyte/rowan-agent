import type { LlmContentBlock, TextBlock } from "@rowan-agent/models";
import type { AgentMessage } from "../protocol/agent";
import type { AgentContext } from "../loop/types";
import type { ResolvedAgentContext } from "./contracts";
import type {
  AgentId,
  AssistantContent,
  AssistantMessage,
  InteractionRecord,
  JsonValue,
  Message,
  RunId,
  UserContent,
} from "../runtime-events";
import { isJsonValue } from "./json";

export const DEFAULT_INTERACTION_TEMPLATES: Record<
  "user_input" | "permission" | "elicitation" | "confirmation",
  Record<"answered" | "replied" | "cancelled", string>
> = {
  user_input: {
    answered: 'The user answered "{{prompt}}": {{answer}}',
    replied: "The user replied instead: {{reply}}",
    cancelled: "The user cancelled input: {{prompt}}",
  },
  permission: {
    answered: "The user granted permission: {{prompt}}",
    replied: "The user replied instead: {{reply}}",
    cancelled: "The user did not grant permission: {{prompt}}",
  },
  elicitation: {
    answered: 'The user answered "{{prompt}}": {{answer}}',
    replied: "The user replied instead: {{reply}}",
    cancelled: "The user cancelled elicitation: {{prompt}}",
  },
  confirmation: {
    answered: "The user confirmed: {{prompt}}",
    replied: "The user replied instead: {{reply}}",
    cancelled: "The user cancelled: {{prompt}}",
  },
};

export function renderInteractionText(
  record: Pick<InteractionRecord, "kind" | "status" | "prompt" | "answer" | "reply" | "result">,
): string {
  const template = record.result?.[record.status]
    ?? DEFAULT_INTERACTION_TEMPLATES[record.kind]?.[record.status]
    ?? "{{prompt}}";
  const answerStr = typeof record.answer === "string"
    ? record.answer
    : (record.answer !== undefined ? JSON.stringify(record.answer) : "");
  const replyStr = record.reply ?? "";
  return template
    .replaceAll("{{prompt}}", record.prompt)
    .replaceAll("{{answer}}", answerStr)
    .replaceAll("{{reply}}", replyStr);
}

/**
 * Message metadata key marking a parallel Phase's committed reply. The join Phase already
 * received that reply as a previous Phase output, so it stays out of later model context.
 */
export const PARALLEL_PHASE_METADATA_KEY = "parallelPhase";

function isParallelPhaseOutput(message: Message): boolean {
  return message.role === "assistant" && message.metadata?.[PARALLEL_PHASE_METADATA_KEY] !== undefined;
}

/** Project durable Runtime messages and tools into the loop's provider-facing context. */
export function projectModelContext(input: {
  context: ResolvedAgentContext;
  messages: readonly Message[];
  agentId: AgentId;
  runId: RunId;
}): AgentContext {
  const toolInteractionTexts = new Map<string, string[]>();
  for (const message of input.messages) {
    if (message.role === "interaction" && message.toolCallId !== undefined) {
      const text = renderInteractionText(message);
      const existing = toolInteractionTexts.get(String(message.toolCallId));
      if (existing) {
        existing.push(text);
      } else {
        toolInteractionTexts.set(String(message.toolCallId), [text]);
      }
    }
  }

  const projectedMessages: AgentMessage[] = [];
  for (const message of input.messages) {
    if (isParallelPhaseOutput(message)) continue;
    if (message.role === "interaction") {
      if (message.toolCallId !== undefined) {
        continue;
      }
      projectedMessages.push({
        id: message.id,
        role: "user",
        content: renderInteractionText(message),
        createdAt: message.createdAt,
        ...(message.metadata ? { metadata: message.metadata as never } : {}),
      });
      continue;
    }
    if (message.role === "tool") {
      projectedMessages.push(projectToolMessage(message, toolInteractionTexts));
      continue;
    }
    projectedMessages.push(projectMessage(message));
  }

  return {
    systemPrompt: input.context.systemPrompt,
    messages: projectedMessages,
    tools: [...input.context.tools],
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
  options: { interrupted?: boolean } = {},
): AssistantMessage {
  return {
    id: message.id as AssistantMessage["id"],
    agentId,
    runId,
    role: "assistant",
    content: options.interrupted ? durableInterruptedAssistantContent(message.content) : durableAssistantContent(message.content),
    sequenceWithinRun,
    createdAt: message.createdAt,
    ...(message.metadata ? { metadata: message.metadata as never } : {}),
    ...(options.interrupted ? { interrupted: true } : {}),
    ...(message.model ? { model: message.model } : {}),
    ...(message.usage ? { usage: message.usage } : {}),
  };
}

function durableInterruptedAssistantContent(content: AgentMessage["content"]): AssistantContent {
  if (typeof content === "string") return content;
  return content
    .filter((part): part is TextBlock => part.type === "text")
    .map((part) => ({ type: "text", text: part.text }));
}

function projectMessage(message: Message): AgentMessage {
  switch (message.role) {
    case "user":
      return {
        id: message.id,
        role: message.role,
        content: projectUserContent(message.content),
        createdAt: message.createdAt,
        ...(message.metadata ? { metadata: message.metadata as never } : {}),
        ...(message.contexts && message.contexts.length > 0 ? { contexts: message.contexts } : {}),
      };
    case "assistant":
      return { id: message.id, role: message.role, content: projectAssistantContent(message.content), createdAt: message.createdAt, ...(message.metadata ? { metadata: message.metadata as never } : {}) };
    case "tool":
      return { id: message.id, role: message.role, content: projectToolContent(message.content), createdAt: message.createdAt, ...(message.metadata ? { metadata: message.metadata as never } : {}) };
    case "interaction":
      return { id: message.id, role: "user", content: renderInteractionText(message), createdAt: message.createdAt, ...(message.metadata ? { metadata: message.metadata as never } : {}) };
  }
}

function projectToolMessage(
  message: Extract<Message, { role: "tool" }>,
  toolInteractionTexts: ReadonlyMap<string, readonly string[]>,
): AgentMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content.map((part) => {
      const isError = "isError" in part.result ? Boolean(part.result.isError) : !part.result.ok;
      const rawResult = Array.isArray(part.result.content)
        ? part.result.content.map((block: any) => block?.type === "text" ? block.text : JSON.stringify(block)).join("\n\n")
        : jsonText(part.result.content);
      const interactionTexts = toolInteractionTexts.get(String(part.toolCallId));
      let content = rawResult;
      if (interactionTexts && interactionTexts.length > 0) {
        const prefix = interactionTexts.join("\n\n");
        content = (rawResult === "null" || rawResult.length === 0)
          ? prefix
          : `${prefix}\n\n${rawResult}`;
      }
      return {
        type: "tool_result",
        toolUseId: part.providerToolCallId ?? String(part.toolCallId),
        content,
        ...(isError ? { isError: true } : {}),
      };
    }),
    createdAt: message.createdAt,
    ...(message.metadata ? { metadata: message.metadata as never } : {}),
  };
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

function projectUserContent(content: UserContent): string | LlmContentBlock[] {
  if (typeof content === "string") return content;
  return content.map((part) => ({ ...part }));
}

function projectAssistantContent(content: AssistantContent): string | LlmContentBlock[] {
  if (typeof content === "string") return content;
  return content.map((part) => {
    if (part.type === "text") return { ...part };
    if (part.type === "thinking") return { ...part };
    return { type: "tool_use", id: part.providerToolCallId ?? part.toolCallId, name: part.name, input: part.input };
  });
}

function projectToolContent(content: Extract<Message, { role: "tool" }>["content"]): LlmContentBlock[] {
  return content.map((part) => {
    const isError = "isError" in part.result ? Boolean(part.result.isError) : !part.result.ok;
    const textContent = Array.isArray(part.result.content)
      ? part.result.content.map((block: any) => block?.type === "text" ? block.text : JSON.stringify(block)).join("\n\n")
      : jsonText(part.result.content);
    return {
      type: "tool_result",
      toolUseId: part.providerToolCallId ?? part.toolCallId,
      content: textContent,
      ...(isError ? { isError: true } : {}),
    };
  });
}

function jsonText(value: JsonValue): string {
  return typeof value === "string" ? value : JSON.stringify(value) ?? "null";
}
