import { isAbsolute, relative, resolve, sep } from "node:path";

export type WorkspacePathContext = {
  root: string;
};

export type ResolvedWorkspacePath = {
  root: string;
  inputPath: string;
  absolutePath: string;
  relativePath: string;
};

export function normalizeRelativePath(path: string): string {
  return path.split(sep).join("/");
}

function normalizeWorkspaceInputPath(path = "."): string {
  const trimmed = path.trim();
  if (!trimmed || trimmed === "/" || trimmed === "\\") return ".";
  return path;
}

export function resolveWorkspacePath(context: WorkspacePathContext, path = "."): ResolvedWorkspacePath {
  const root = resolve(context.root);
  const inputPath = normalizeWorkspaceInputPath(path);
  const absolutePath = resolve(root, inputPath);
  const relativePath = relative(root, absolutePath);

  if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error(`Path escapes workspace root: ${path}`);
  }

  return {
    root,
    inputPath,
    absolutePath,
    relativePath: normalizeRelativePath(relativePath || "."),
  };
}
