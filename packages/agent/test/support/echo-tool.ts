import Type from "typebox";
import type { Tool, ToolContext, ToolResult } from "../../src/types";

export const echoTool: Tool<{ message: string }> = {
  name: "echo",
  description: "Returns the input message as evidence.",
  parameters: Type.Object({
    message: Type.String(),
  }),
  async execute(args: { message: string }, context: ToolContext): Promise<ToolResult> {
    return {
      toolCallId: context.toolCallId,
      toolName: "echo",
      ok: true,
      content: args.message,
    };
  },
};

export function createEchoTools(): Tool[] {
  return [echoTool];
}
