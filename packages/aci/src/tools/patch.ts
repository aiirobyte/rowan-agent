import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import Type from "typebox";
import Schema from "typebox/schema";
import type { Tool, ToolContext, ToolResult } from "@rowan-agent/agent";
import { type WorkspaceContext, resolveWorkspacePath } from "../workspace";

const PatchArgsSchema = Type.Object({
  path: Type.String(),
  content: Type.String(),
});

type PatchArgs = Type.Static<typeof PatchArgsSchema>;
const PatchArgsValidator = Schema.Compile(PatchArgsSchema);

export function createWorkspacePatchTool(context: WorkspaceContext): Tool<PatchArgs> {
  return {
    name: "workspace.patch",
    description: "Writes provided content to a workspace file. This tool is only available when write access is enabled.",
    parameters: PatchArgsSchema,
    async execute(args: PatchArgs, toolContext: ToolContext): Promise<ToolResult> {
      if (!context.allowWrite) {
        return {
          toolCallId: toolContext.toolCallId,
          toolName: "workspace.patch",
          ok: false,
          content: null,
          error: "Workspace write access is disabled.",
        };
      }

      const parsed = PatchArgsValidator.Parse(args);
      const resolved = resolveWorkspacePath(context, parsed.path);
      await mkdir(dirname(resolved.absolutePath), { recursive: true });
      await writeFile(resolved.absolutePath, parsed.content, "utf8");

      return {
        toolCallId: toolContext.toolCallId,
        toolName: "workspace.patch",
        ok: true,
        content: {
          path: resolved.relativePath,
          bytesWritten: new TextEncoder().encode(parsed.content).byteLength,
        },
      };
    },
  };
}
