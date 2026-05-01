import { readFile, stat } from "node:fs/promises";
import Type from "typebox";
import Schema from "typebox/schema";
import type { Tool, ToolContext, ToolResult } from "@rowan-agent/agent";
import { type WorkspaceContext, resolveWorkspacePath } from "../workspace";

const ReadArgsSchema = Type.Object({
  path: Type.String(),
  maxBytes: Type.Optional(Type.Number()),
});

type ReadArgs = Type.Static<typeof ReadArgsSchema>;
const ReadArgsValidator = Schema.Compile(ReadArgsSchema);

export function createWorkspaceReadTool(context: WorkspaceContext): Tool<ReadArgs> {
  return {
    name: "workspace.read",
    description: "Reads a text file within the workspace.",
    parameters: ReadArgsSchema,
    async execute(args: ReadArgs, toolContext: ToolContext): Promise<ToolResult> {
      const parsed = ReadArgsValidator.Parse(args);
      const resolved = resolveWorkspacePath(context, parsed.path);
      const maxBytes = parsed.maxBytes ?? context.maxReadBytes ?? 64_000;
      const fileStat = await stat(resolved.absolutePath);

      if (!fileStat.isFile()) {
        return {
          toolCallId: toolContext.toolCallId,
          toolName: "workspace.read",
          ok: false,
          content: null,
          error: `Not a file: ${resolved.relativePath}`,
        };
      }

      const bytes = await readFile(resolved.absolutePath);
      const sliced = bytes.subarray(0, maxBytes);
      return {
        toolCallId: toolContext.toolCallId,
        toolName: "workspace.read",
        ok: true,
        content: {
          path: resolved.relativePath,
          content: new TextDecoder().decode(sliced),
          sizeBytes: bytes.byteLength,
          truncated: bytes.byteLength > maxBytes,
        },
      };
    },
  };
}
