import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import Type from "typebox";
import Schema from "typebox/schema";
import type { Tool, ToolContext, ToolResult } from "@rowan-agent/agent";
import {
  type WorkspaceContext,
  isIgnoredWorkspacePath,
  normalizeRelativePath,
  resolveWorkspacePath,
} from "../workspace";

const ListArgsSchema = Type.Object({
  path: Type.Optional(Type.String()),
  recursive: Type.Optional(Type.Boolean()),
  maxEntries: Type.Optional(Type.Number()),
});

type ListArgs = Type.Static<typeof ListArgsSchema>;
const ListArgsValidator = Schema.Compile(ListArgsSchema);

async function collectEntries(input: {
  context: WorkspaceContext;
  absolutePath: string;
  baseRelativePath: string;
  recursive: boolean;
  maxEntries: number;
  entries: Array<{ path: string; type: "file" | "directory"; sizeBytes?: number }>;
}): Promise<void> {
  if (input.entries.length >= input.maxEntries) {
    return;
  }

  const dirEntries = await readdir(input.absolutePath, { withFileTypes: true });
  for (const entry of dirEntries) {
    const relativePath = normalizeRelativePath(
      input.baseRelativePath === "." ? entry.name : join(input.baseRelativePath, entry.name),
    );
    if (isIgnoredWorkspacePath(input.context, relativePath)) {
      continue;
    }

    const absolutePath = join(input.absolutePath, entry.name);
    const entryStat = await stat(absolutePath);
    const type = entry.isDirectory() ? "directory" : "file";
    input.entries.push({
      path: relativePath,
      type,
      ...(entry.isFile() ? { sizeBytes: entryStat.size } : {}),
    });

    if (input.entries.length >= input.maxEntries) {
      return;
    }

    if (input.recursive && entry.isDirectory()) {
      await collectEntries({
        ...input,
        absolutePath,
        baseRelativePath: relativePath,
      });
    }
  }
}

export function createWorkspaceListTool(context: WorkspaceContext): Tool<ListArgs> {
  return {
    name: "workspace.list",
    description: "Lists files and directories within the workspace.",
    parameters: ListArgsSchema,
    async execute(args: ListArgs, toolContext: ToolContext): Promise<ToolResult> {
      const parsed = ListArgsValidator.Parse(args);
      const resolved = resolveWorkspacePath(context, parsed.path ?? ".");
      const entryStat = await stat(resolved.absolutePath);
      const entries: Array<{ path: string; type: "file" | "directory"; sizeBytes?: number }> = [];

      if (entryStat.isFile()) {
        entries.push({
          path: resolved.relativePath,
          type: "file",
          sizeBytes: entryStat.size,
        });
      } else {
        await collectEntries({
          context,
          absolutePath: resolved.absolutePath,
          baseRelativePath: resolved.relativePath,
          recursive: parsed.recursive ?? false,
          maxEntries: parsed.maxEntries ?? context.maxEntries ?? 200,
          entries,
        });
      }

      return {
        toolCallId: toolContext.toolCallId,
        toolName: "workspace.list",
        ok: true,
        content: {
          root: resolved.root,
          path: resolved.relativePath,
          entries,
          truncated: entries.length >= (parsed.maxEntries ?? context.maxEntries ?? 200),
        },
      };
    },
  };
}
