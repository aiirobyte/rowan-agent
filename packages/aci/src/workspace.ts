import { resolve } from "node:path";
import type { Tool } from "@rowan-agent/agent";
import { ROWAN_RUNS_DIR, normalizeRelativePath } from "@rowan-agent/workspace";
import { createWorkspaceBashTool } from "./tools/bash";
import { createWorkspaceDiffTool } from "./tools/diff";
import { createWorkspaceListTool } from "./tools/list";
import { createWorkspacePatchTool } from "./tools/patch";
import { createWorkspaceReadTool } from "./tools/read";
import { createWorkspaceSearchTool } from "./tools/search";
export { type ResolvedWorkspacePath, normalizeRelativePath, resolveWorkspacePath } from "@rowan-agent/workspace";

export type WorkspaceContext = {
  root: string;
  allowWrite?: boolean;
  allowExecute?: boolean;
  ignoredPaths?: string[];
  maxEntries?: number;
  maxReadBytes?: number;
  maxSearchMatches?: number;
  bashTimeoutMs?: number;
  maxBashOutputBytes?: number;
};

export const DEFAULT_IGNORED_PATHS = [".git", "node_modules", ROWAN_RUNS_DIR];

export function createWorkspaceContext(input: Partial<WorkspaceContext> = {}): WorkspaceContext {
  return {
    root: resolve(input.root ?? process.cwd()),
    allowWrite: input.allowWrite ?? false,
    allowExecute: input.allowExecute ?? false,
    ignoredPaths: input.ignoredPaths ?? DEFAULT_IGNORED_PATHS,
    maxEntries: input.maxEntries ?? 200,
    maxReadBytes: input.maxReadBytes ?? 64_000,
    maxSearchMatches: input.maxSearchMatches ?? 100,
    bashTimeoutMs: input.bashTimeoutMs ?? 30_000,
    maxBashOutputBytes: input.maxBashOutputBytes ?? 64_000,
  };
}

export function isIgnoredWorkspacePath(context: WorkspaceContext, relativePath: string): boolean {
  const normalized = normalizeRelativePath(relativePath);
  const ignored = context.ignoredPaths ?? DEFAULT_IGNORED_PATHS;
  const parts = normalized.split("/");

  return ignored.some((pattern) => {
    const normalizedPattern = normalizeRelativePath(pattern);
    if (normalizedPattern.includes("/")) {
      return normalized === normalizedPattern || normalized.startsWith(`${normalizedPattern}/`);
    }

    return parts.includes(normalizedPattern);
  });
}

export function createWorkspaceTools(input: Partial<WorkspaceContext> = {}): Tool[] {
  const context = createWorkspaceContext(input);
  const tools: Tool[] = [
    createWorkspaceListTool(context),
    createWorkspaceReadTool(context),
    createWorkspaceSearchTool(context),
    createWorkspaceDiffTool(context),
  ];

  if (context.allowWrite) {
    tools.push(createWorkspacePatchTool(context));
  }

  if (context.allowExecute) {
    tools.push(createWorkspaceBashTool(context));
  }

  return tools;
}
