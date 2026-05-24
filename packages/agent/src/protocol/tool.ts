export type ToolDefinition = {
  name: string;
  description: string;
  parameters: unknown;
};

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
