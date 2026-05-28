export type { LlmToolDefinition as ToolDefinition } from "@rowan-agent/models";

export type ToolCall = {
  id: string;
  name: string;
  args: unknown;
};

export type ToolResult = {
  toolCallId: string;
  toolName: string;
  ok: boolean;
  content: unknown;
  error?: string;
};
