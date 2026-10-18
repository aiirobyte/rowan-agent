import type { AgentMessage } from "../protocol/agent";
import type { LlmContentBlock, StreamBlock } from "@rowan-agent/models";
import { createId, createTimestamp } from "../utils";

export function createMessage(
  role: AgentMessage["role"],
  content: AgentMessage["content"],
  metadata?: Record<string, unknown>,
): AgentMessage {
  return {
    id: createId("msg"),
    role,
    content,
    createdAt: createTimestamp(),
    ...(metadata ? { metadata: metadata as never } : {}),
  };
}

export function messageContentText(content: AgentMessage["content"]): string {
  if (typeof content === "string") {
    return content;
  }

  return content
    .map((part: LlmContentBlock) => {
      if (part.type === "text") return part.text;
      if (part.type === "thinking") return part.thinking;
      if (part.type === "tool_result") {
        return typeof part.content === "string" ? part.content : JSON.stringify(part.content);
      }
      if (part.type === "tool_use") return JSON.stringify(part.input);
      if (part.type === "image") return `[image:${part.mimeType}]`;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

export function contentBlocksToMessageContent(blocks: readonly StreamBlock[]): LlmContentBlock[] {
  return blocks.map((block): LlmContentBlock => {
    if (block.type === "text") {
      return { type: "text", text: block.text };
    }
    if (block.type === "thinking") {
      return { type: "thinking", thinking: block.thinking, ...(block.signature ? { signature: block.signature } : {}) };
    }
    if (block.type === "tool_call") {
      let input: unknown = block.args;
      try {
        input = JSON.parse(block.args);
      } catch {
        // Keep raw arguments when the provider streamed incomplete or non-JSON input.
      }
      return { type: "tool_use", id: block.id, name: block.name, input };
    }
    return { type: "text", text: JSON.stringify(block) };
  });
}
