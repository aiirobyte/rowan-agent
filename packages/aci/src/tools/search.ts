import { readdir, readFile, stat } from "node:fs/promises";
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

const SearchArgsSchema = Type.Object({
  query: Type.String(),
  path: Type.Optional(Type.String()),
  maxMatches: Type.Optional(Type.Number()),
});

type SearchArgs = Type.Static<typeof SearchArgsSchema>;
const SearchArgsValidator = Schema.Compile(SearchArgsSchema);

type SearchMatch = {
  path: string;
  line: number;
  text: string;
};

async function searchFile(path: string, relativePath: string, query: string): Promise<SearchMatch[]> {
  const content = await readFile(path, "utf8").catch(() => undefined);
  if (content === undefined) {
    return [];
  }

  const matches: SearchMatch[] = [];
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    if (line.includes(query)) {
      matches.push({
        path: relativePath,
        line: index + 1,
        text: line,
      });
    }
  }
  return matches;
}

async function searchDirectory(input: {
  context: WorkspaceContext;
  absolutePath: string;
  baseRelativePath: string;
  query: string;
  maxMatches: number;
  matches: SearchMatch[];
}): Promise<void> {
  if (input.matches.length >= input.maxMatches) {
    return;
  }

  const entries = await readdir(input.absolutePath, { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = normalizeRelativePath(
      input.baseRelativePath === "." ? entry.name : join(input.baseRelativePath, entry.name),
    );
    if (isIgnoredWorkspacePath(input.context, relativePath)) {
      continue;
    }

    const absolutePath = join(input.absolutePath, entry.name);
    const entryStat = await stat(absolutePath);
    if (entryStat.isDirectory()) {
      await searchDirectory({
        ...input,
        absolutePath,
        baseRelativePath: relativePath,
      });
      continue;
    }

    if (entryStat.isFile()) {
      input.matches.push(...(await searchFile(absolutePath, relativePath, input.query)));
      if (input.matches.length >= input.maxMatches) {
        input.matches.length = input.maxMatches;
        return;
      }
    }
  }
}

export function createWorkspaceSearchTool(context: WorkspaceContext): Tool<SearchArgs> {
  return {
    name: "workspace.search",
    description: "Searches text files within the workspace.",
    parameters: SearchArgsSchema,
    async execute(args: SearchArgs, toolContext: ToolContext): Promise<ToolResult> {
      const parsed = SearchArgsValidator.Parse(args);
      const resolved = resolveWorkspacePath(context, parsed.path ?? ".");
      const maxMatches = parsed.maxMatches ?? context.maxSearchMatches ?? 100;
      const entryStat = await stat(resolved.absolutePath);
      const matches: SearchMatch[] = [];

      if (entryStat.isFile()) {
        matches.push(...(await searchFile(resolved.absolutePath, resolved.relativePath, parsed.query)));
      } else {
        await searchDirectory({
          context,
          absolutePath: resolved.absolutePath,
          baseRelativePath: resolved.relativePath,
          query: parsed.query,
          maxMatches,
          matches,
        });
      }

      return {
        toolCallId: toolContext.toolCallId,
        toolName: "workspace.search",
        ok: true,
        content: {
          query: parsed.query,
          path: resolved.relativePath,
          matches: matches.slice(0, maxMatches),
          truncated: matches.length >= maxMatches,
        },
      };
    },
  };
}
