import { readFile } from "node:fs/promises";
import { basename, dirname, extname } from "node:path";
import { parse as parseYaml } from "yaml";

export class FrontmatterParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FrontmatterParseError";
  }
}

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
 * Parse YAML frontmatter and return the markdown body after the closing delimiter.
 */
export function parseFrontmatter<T = Record<string, unknown>>(raw: string): FrontmatterResult<T> {
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized.startsWith("---")) return { frontmatter: {} as T, body: normalized };

  const endIndex = normalized.indexOf("\n---", 3);
  if (endIndex === -1) return { frontmatter: {} as T, body: normalized };

  const yamlString = normalized.slice(4, endIndex);
  try {
    const frontmatter = parseYaml(yamlString) ?? {};
    return {
      frontmatter: frontmatter as T,
      body: normalized.slice(endIndex + 4).trim(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new FrontmatterParseError(message);
  }
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
