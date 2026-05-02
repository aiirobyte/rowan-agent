import { existsSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import type { Skill } from "@rowan-agent/session";
import {
  type RowanWorkspacePaths,
  resolveInRowanWorkspace,
  resolveRowanWorkspacePaths,
} from "@rowan-agent/workspace";

function inferSkillId(path: string): string {
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

export function resolveSkillPath(input: string, workspace = resolveRowanWorkspacePaths()): string {
  if (isAbsolute(input)) {
    return input;
  }

  if (!isExplicitPath(input)) {
    return join(workspace.skillsDir, input, "SKILL.md");
  }

  const workspacePath = resolveInRowanWorkspace(input, workspace);
  if (existsSync(workspacePath)) {
    return workspacePath;
  }

  return resolve(input);
}

export async function loadSkill(path: string, workspace?: RowanWorkspacePaths): Promise<Skill> {
  const resolved = resolveSkillPath(path, workspace);
  const content = await readFile(resolved, "utf8");
  return {
    id: inferSkillId(resolved),
    path: resolved,
    content,
  };
}

export async function loadSkills(paths: string[] = [], workspace?: RowanWorkspacePaths): Promise<Skill[]> {
  return Promise.all(paths.map((path) => loadSkill(path, workspace)));
}
