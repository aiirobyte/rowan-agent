import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";

export const WORKSPACE_ENV = "ROWAN_WORKSPACE";
export const RUNTIME_ENV = "ROWAN_RUNTIME";
export const PACKAGED_ENV = "ROWAN_PACKAGED";
export const BINARY_WORKSPACE_DIR = ".rowan";
export const RUNS_DIR = "runs";
export const SESSIONS_DIR = "sessions";
export const SKILLS_DIR = "skills";

export type RuntimeMode = "source" | "binary";

export type WorkspacePaths = {
  mode: RuntimeMode;
  root: string;
  runsDir: string;
  sessionsDir: string;
  skillsDir: string;
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
  execPath?: string;
  entrypoint?: string;
  homeDir?: string;
  mode?: RuntimeMode;
};

function nonEmptyEnv(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

function isTruthyEnvValue(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "yes";
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

export function detectRuntimeMode(
  input: Pick<ResolveWorkspaceOptions, "env" | "execPath"> = {},
): RuntimeMode {
  const env = input.env ?? process.env;
  const explicitMode = nonEmptyEnv(env, RUNTIME_ENV)?.toLowerCase();
  if (explicitMode === "source" || explicitMode === "binary") {
    return explicitMode;
  }

  if (isTruthyEnvValue(nonEmptyEnv(env, PACKAGED_ENV))) {
    return "binary";
  }

  const executable = basename(input.execPath ?? process.execPath).toLowerCase().replace(/\.exe$/, "");
  return executable === "bun" ? "source" : "binary";
}

function defaultSourceStartDir(options: Pick<ResolveWorkspaceOptions, "cwd" | "entrypoint">): string {
  if (options.cwd) {
    return options.cwd;
  }

  const entrypoint = options.entrypoint ?? process.argv[1];
  if (entrypoint) {
    const entrypointPath = resolve(process.cwd(), entrypoint);
    if (existsSync(entrypointPath)) {
      return dirname(entrypointPath);
    }
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

  const mode = options.mode ?? detectRuntimeMode(options);
  if (mode === "binary") {
    return join(homeDir, BINARY_WORKSPACE_DIR);
  }

  return findSourceWorkspaceRoot(defaultSourceStartDir(options));
}

export function resolveWorkspacePaths(options: ResolveWorkspaceOptions = {}): WorkspacePaths {
  const mode = options.mode ?? detectRuntimeMode(options);
  const root = resolveWorkspaceRoot({ ...options, mode });
  return {
    mode,
    root,
    runsDir: join(root, RUNS_DIR),
    sessionsDir: join(root, SESSIONS_DIR),
    skillsDir: join(root, SKILLS_DIR),
  };
}

export function resolveInWorkspace(path: string, rootOrPaths: string | Pick<WorkspacePaths, "root">): string {
  if (path === "~" || path.startsWith("~/") || path.startsWith("~\\")) {
    return resolveUserPath(path, homedir());
  }

  if (isAbsolute(path)) {
    return path;
  }

  const root = typeof rootOrPaths === "string" ? rootOrPaths : rootOrPaths.root;
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
