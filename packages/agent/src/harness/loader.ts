import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import { type WorkspacePaths, resolveInWorkspace, resolveWorkspacePaths } from "./env/path";

/** Parsed frontmatter result */
export interface FrontmatterResult<T = Record<string, unknown>> {
  frontmatter: T;
  body: string;
}

/** Full markdown file load result */
export interface MarkdownLoadResult<T = Record<string, unknown>> {
  frontmatter: T;
  body: string;
  raw: string;
}

/**
 * Parse YAML frontmatter from markdown content.
 * Simple parser - handles key: value pairs, arrays in brackets.
 */
export function parseFrontmatter<T = Record<string, unknown>>(raw: string): FrontmatterResult<T> {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { frontmatter: {} as T, body: raw };

  const frontmatter: Record<string, unknown> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) frontmatter[key] = parseValue(value);
  }

  return { frontmatter: frontmatter as T, body: raw.slice(match[0].length) };
}

/** Parse a YAML value - handles arrays, booleans, numbers, and strings. */
function parseValue(value: string): unknown {
  // Array in brackets: [a, b, c]
  const arrayMatch = value.match(/^\[(.*)\]$/);
  if (arrayMatch) {
    return arrayMatch[1].split(",").map((s) => s.trim()).filter(Boolean);
  }

  // Boolean
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;

  // Number
  if (/^\d+$/.test(value)) return Number(value);

  // Remove quotes if present
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  return value;
}

/**
 * Read and parse a markdown file with frontmatter.
 */
export async function loadMarkdown<T = Record<string, unknown>>(filePath: string): Promise<MarkdownLoadResult<T>> {
  const raw = await readFile(filePath, "utf8");
  const { frontmatter, body } = parseFrontmatter<T>(raw);
  return { frontmatter, body, raw };
}

/**
 * Check if input is an explicit path (contains path separators or has file extension).
 */
export function isExplicitPath(input: string): boolean {
  return input.includes("/") || input.includes("\\") || Boolean(extname(input));
}

/**
 * Infer resource name from file path.
 * If file matches markerFile (e.g., "SKILL.md"), use parent directory name.
 * Otherwise use filename without extension.
 */
export function inferResourceName(path: string, markerFile: string): string {
  const file = basename(path);
  if (file.toLowerCase() === markerFile.toLowerCase()) {
    return basename(dirname(path));
  }

  const extension = extname(file);
  return extension ? file.slice(0, -extension.length) : file;
}

/**
 * Resolve path for a resource in .rowan directory.
 *
 * Resolution order:
 * 1. If absolute path, return as-is
 * 2. If not explicit path (no / or extension), resolve as .rowan/<type>/<input>/<markerFile>
 * 3. Try resolving in workspace
 * 4. Fall back to absolute path resolution
 */
export function resolveResourcePath(
  input: string,
  resourceType: string,
  markerFile: string,
  workspace?: WorkspacePaths,
): string {
  const ws = workspace ?? resolveWorkspacePaths();

  if (isAbsolute(input)) {
    return input;
  }

  if (!isExplicitPath(input)) {
    return join(ws.rowanDir, resourceType, input, markerFile);
  }

  const workspacePath = resolveInWorkspace(input, ws);
  if (existsSync(workspacePath)) {
    return workspacePath;
  }

  return resolve(input);
}
