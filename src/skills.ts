import { basename, dirname, extname, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import type { Skill } from "./types";

function inferSkillId(path: string): string {
  const file = basename(path);
  if (file.toLowerCase() === "skill.md") {
    return basename(dirname(path));
  }

  const extension = extname(file);
  return extension ? file.slice(0, -extension.length) : file;
}

export async function loadSkill(path: string): Promise<Skill> {
  const resolved = resolve(path);
  const content = await readFile(resolved, "utf8");
  return {
    id: inferSkillId(resolved),
    path: resolved,
    content,
  };
}

export async function loadSkills(paths: string[] = []): Promise<Skill[]> {
  return Promise.all(paths.map((path) => loadSkill(path)));
}
