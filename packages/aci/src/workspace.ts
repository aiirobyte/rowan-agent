import { relative, resolve, sep } from "node:path";
import type { Tool } from "@rowan-agent/agent";
import { createWorkspaceDiffTool } from "./tools/diff";
import { createWorkspaceListTool } from "./tools/list";
import { createWorkspacePatchTool } from "./tools/patch";
import { createWorkspaceReadTool } from "./tools/read";
import { createWorkspaceSearchTool } from "./tools/search";
import { createWorkspaceTestTool } from "./tools/test";

export type WorkspaceContext = {
  root: string;
  allowWrite?: boolean;
  allowExecute?: boolean;
  allowedTestCommands?: string[];
  ignoredPaths?: string[];
  maxEntries?: number;
  maxReadBytes?: number;
  maxSearchMatches?: number;
};

export type ResolvedWorkspacePath = {
  root: string;
  inputPath: string;
  absolutePath: string;
  relativePath: string;
};

export const DEFAULT_IGNORED_PATHS = [".git", "node_modules", ".rowan/runs"];

export function createWorkspaceContext(input: Partial<WorkspaceContext> = {}): WorkspaceContext {
  return {
    root: resolve(input.root ?? process.cwd()),
    allowWrite: input.allowWrite ?? false,
    allowExecute: input.allowExecute ?? false,
    allowedTestCommands: input.allowedTestCommands ?? [],
    ignoredPaths: input.ignoredPaths ?? DEFAULT_IGNORED_PATHS,
    maxEntries: input.maxEntries ?? 200,
    maxReadBytes: input.maxReadBytes ?? 64_000,
    maxSearchMatches: input.maxSearchMatches ?? 100,
  };
}

export function normalizeRelativePath(path: string): string {
  return path.split(sep).join("/");
}

export function resolveWorkspacePath(context: WorkspaceContext, path = "."): ResolvedWorkspacePath {
  const root = resolve(context.root);
  const absolutePath = resolve(root, path);
  const relativePath = relative(root, absolutePath);

  if (relativePath.startsWith("..") || resolve(relativePath) === absolutePath) {
    throw new Error(`Path escapes workspace root: ${path}`);
  }

  return {
    root,
    inputPath: path,
    absolutePath,
    relativePath: normalizeRelativePath(relativePath || "."),
  };
}

export function isIgnoredWorkspacePath(context: WorkspaceContext, relativePath: string): boolean {
  const normalized = normalizeRelativePath(relativePath);
  const ignored = context.ignoredPaths ?? DEFAULT_IGNORED_PATHS;
  return ignored.some((pattern) => normalized === pattern || normalized.startsWith(`${pattern}/`));
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
    tools.push(createWorkspaceTestTool(context));
  }

  return tools;
}
