import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import type { AgentContextSkill as Skill } from "../protocol";
import {
  type WorkspacePaths,
  resolveInWorkspace,
  resolveWorkspacePaths,
} from "./env/path";

function inferSkillName(path: string): string {
  const file = basename(path);
  if (file.toLowerCase() === "skill.md") {
    return basename(dirname(path));
  }

  const extension = extname(file);
  return extension ? file.slice(0, -extension.length) : file;
}

function isExplicitPath(input: string): boolean {
  return input.includes("/") || input.includes("\\") || Boolean(extname(input));
}

export function resolveSkillPath(input: string, workspace = resolveWorkspacePaths()): string {
  if (isAbsolute(input)) {
    return input;
  }

  if (!isExplicitPath(input)) {
    return join(workspace.rowanDir, "skills", input, "SKILL.md");
  }

  const workspacePath = resolveInWorkspace(input, workspace);
  if (existsSync(workspacePath)) {
    return workspacePath;
  }

  return resolve(input);
}

/** Parse YAML frontmatter from a markdown file. Returns key-value pairs and the body. */
function parseFrontmatter(raw: string): { frontmatter: Record<string, string>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { frontmatter: {}, body: raw };

  const frontmatter: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) frontmatter[key] = value;
  }

  return { frontmatter, body: raw.slice(match[0].length) };
}

export async function loadSkill(path: string, workspace?: WorkspacePaths): Promise<Skill> {
  const resolved = resolveSkillPath(path, workspace);
  const raw = await readFile(resolved, "utf8");
  const { frontmatter } = parseFrontmatter(raw);

  return {
    name: frontmatter.name ?? inferSkillName(resolved),
    description: frontmatter.description ?? "",
    filePath: resolved,
    baseDir: dirname(resolved),
    disableModelInvocation: frontmatter["disable-model-invocation"] === "true",
  };
}

export async function loadSkills(paths: string[] = [], workspace?: WorkspacePaths): Promise<Skill[]> {
  return Promise.all(paths.map((path) => loadSkill(path, workspace)));
}
