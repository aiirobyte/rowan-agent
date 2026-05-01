import { readFile } from "node:fs/promises";
import Type from "typebox";
import Schema from "typebox/schema";
import type { Tool, ToolContext, ToolResult } from "@rowan-agent/agent";
import { type WorkspaceContext, resolveWorkspacePath } from "../workspace";

const DiffArgsSchema = Type.Object({
  path: Type.String(),
  content: Type.String(),
});

type DiffArgs = Type.Static<typeof DiffArgsSchema>;
const DiffArgsValidator = Schema.Compile(DiffArgsSchema);

function simpleLineDiff(before: string, after: string): string {
  const beforeLines = before.split(/\r?\n/);
  const afterLines = after.split(/\r?\n/);
  const max = Math.max(beforeLines.length, afterLines.length);
  const output = ["--- before", "+++ after"];

  for (let index = 0; index < max; index++) {
    const left = beforeLines[index];
    const right = afterLines[index];
    if (left === right) {
      output.push(` ${left ?? ""}`);
      continue;
    }
    if (left !== undefined) {
      output.push(`-${left}`);
    }
    if (right !== undefined) {
      output.push(`+${right}`);
    }
  }

  return output.join("\n");
}

export function createWorkspaceDiffTool(context: WorkspaceContext): Tool<DiffArgs> {
  return {
    name: "workspace.diff",
    description: "Previews a simple line diff for replacing a workspace file with provided content.",
    parameters: DiffArgsSchema,
    async execute(args: DiffArgs, toolContext: ToolContext): Promise<ToolResult> {
      const parsed = DiffArgsValidator.Parse(args);
      const resolved = resolveWorkspacePath(context, parsed.path);
      const current = await readFile(resolved.absolutePath, "utf8").catch(() => "");

      return {
        toolCallId: toolContext.toolCallId,
        toolName: "workspace.diff",
        ok: true,
        content: {
          path: resolved.relativePath,
          diff: simpleLineDiff(current, parsed.content),
        },
      };
    },
  };
}
