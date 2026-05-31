import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import type { AgentContextSkill as Skill } from "../protocol";
import {
  type WorkspacePaths,
  resolveInWorkspace,
  resolveWorkspacePaths,
} from "./env/path";

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

export async function loadSkill(path: string, workspace?: WorkspacePaths): Promise<Skill> {
  const resolved = resolveSkillPath(path, workspace);
  const content = await readFile(resolved, "utf8");
  return {
    id: inferSkillId(resolved),
    path: resolved,
    content,
  };
}

export async function loadSkills(paths: string[] = [], workspace?: WorkspacePaths): Promise<Skill[]> {
  return Promise.all(paths.map((path) => loadSkill(path, workspace)));
}
