import { readFile } from "node:fs/promises";
import { basename, dirname, extname } from "node:path";

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
 * Simple parser - handles key: value pairs, arrays in brackets, and single-level nested maps.
 */
export function parseFrontmatter<T = Record<string, unknown>>(raw: string): FrontmatterResult<T> {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { frontmatter: {} as T, body: raw };

  const lines = match[1].split("\n");
  const frontmatter: Record<string, unknown> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!key) continue;

    // Empty value → check for single-level nested map
    if (value === "" && i + 1 < lines.length) {
      const nested: Record<string, string> = {};
      while (i + 1 < lines.length) {
        const next = lines[i + 1];
        if (!next.startsWith("  ") || next.trim() === "") break;
        const nIdx = next.indexOf(":");
        if (nIdx === -1) break;
        const nKey = next.slice(0, nIdx).trim();
        const nValue = next.slice(nIdx + 1).trim();
        nested[nKey] = nValue;
        i++;
      }
      if (Object.keys(nested).length) {
        frontmatter[key] = nested;
      }
      continue;
    }

    frontmatter[key] = parseValue(value);
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
