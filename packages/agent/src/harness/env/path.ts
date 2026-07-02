import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";

export const WORKSPACE_ENV = "ROWAN_WORKSPACE";
export const BINARY_WORKSPACE_DIR = ".rowan";

export type WorkspacePaths = {
  cwd: string;
  rowanDir: string;
};

export type WorkspacePathContext = {
  root: string;
};

export type ResolvedWorkspacePath = {
  root: string;
  inputPath: string;
  absolutePath: string;
  relativePath: string;
};

export type ResolveWorkspaceOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  rowanDir?: string;
};

function nonEmptyEnv(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

function resolveUserPath(path: string, homeDir: string): string {
  if (path === "~") {
    return homeDir;
  }

  if (path.startsWith("~/") || path.startsWith("~\\")) {
    return join(homeDir, path.slice(2));
  }

  return resolve(path);
}

function isSourceWorkspaceRoot(path: string): boolean {
  const packagePath = join(path, "package.json");
  if (!existsSync(packagePath)) {
    return false;
  }

  try {
    const manifest = JSON.parse(readFileSync(packagePath, "utf8")) as {
      name?: unknown;
      workspaces?: unknown;
    };
    return manifest.name === "rowan-agent" || Array.isArray(manifest.workspaces);
  } catch {
    return false;
  }
}

export function findSourceWorkspaceRoot(startDir = process.cwd()): string {
  let current = resolve(startDir);
  const { root } = parse(current);

  while (true) {
    if (isSourceWorkspaceRoot(current)) {
      return current;
    }

    if (current === root) {
      return resolve(startDir);
    }

    current = dirname(current);
  }
}

function defaultWorkspaceStartDir(options: Pick<ResolveWorkspaceOptions, "cwd">): string {
  if (options.cwd) {
    return options.cwd;
  }

  return process.cwd();
}

export function resolveWorkspaceRoot(options: ResolveWorkspaceOptions = {}): string {
  const env = options.env ?? process.env;
  const homeDir = options.homeDir ?? homedir();
  const override = nonEmptyEnv(env, WORKSPACE_ENV);

  if (override) {
    return resolveUserPath(override, homeDir);
  }

  return findSourceWorkspaceRoot(defaultWorkspaceStartDir(options));
}

export function resolveWorkspacePaths(options: ResolveWorkspaceOptions = {}): WorkspacePaths {
  const cwd = resolveWorkspaceRoot(options);
  return {
    cwd,
    rowanDir: resolveProjectRowanDir(cwd, options.rowanDir),
  };
}

export function resolveProjectRowanDir(cwd: string, rowanDir = BINARY_WORKSPACE_DIR): string {
  const inputPath = rowanDir.trim() || BINARY_WORKSPACE_DIR;
  if (isAbsolute(inputPath)) {
    throw new Error(`Project Rowan dir must be a relative path: ${rowanDir}`);
  }
  return resolveWorkspacePath({ root: cwd }, inputPath).absolutePath;
}

export function resolveInWorkspace(path: string, rootOrPaths: string | Pick<WorkspacePaths, "cwd">): string {
  if (path === "~" || path.startsWith("~/") || path.startsWith("~\\")) {
    return resolveUserPath(path, homedir());
  }

  if (isAbsolute(path)) {
    return path;
  }

  const root = typeof rootOrPaths === "string" ? rootOrPaths : rootOrPaths.cwd;
  return resolve(root, path);
}

export function normalizeRelativePath(path: string): string {
  return path.split(sep).join("/");
}

function normalizeWorkspaceInputPath(path = "."): string {
  const trimmed = path.trim();
  if (!trimmed || trimmed === "/" || trimmed === "\\") {
    return ".";
  }

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
