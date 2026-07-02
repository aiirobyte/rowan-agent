import { existsSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { Skill } from "../protocol";
import {
  loadMarkdown,
  inferResourceName,
} from "./loader";
import { formatResourceOutput } from "./context/resource-formatter";

const SKILL_MARKER = "SKILL.md";

function resolveSkillPath(input: string): string {
  const resolved = resolve(input);
  return existsSync(resolved) && statSync(resolved).isDirectory()
    ? join(resolved, SKILL_MARKER)
    : resolved;
}

/** Format skill content for LLM consumption using unified XML format. */
export function readSkillContent(skill: Skill): string {
  return formatResourceOutput({
    type: "skill", name: skill.name, location: skill.filePath,
    content: skill.content, baseDir: skill.baseDir,
  });
}

export async function loadSkill(path: string): Promise<Skill> {
  const resolved = resolveSkillPath(path);
  const { frontmatter, body } = await loadMarkdown(resolved);

  return {
    name: (frontmatter.name as string) ?? inferResourceName(resolved, SKILL_MARKER),
    description: (frontmatter.description as string) ?? "",
    filePath: resolved,
    baseDir: dirname(resolved),
    content: body,
    disableModelInvocation: frontmatter["disable-model-invocation"] === true,
  };
}

export async function loadSkills(targetPath: string): Promise<Skill[]> {
  const skillsDir = resolve(targetPath);

  if (existsSync(skillsDir) && statSync(skillsDir).isFile()) {
    return [await loadSkill(skillsDir)];
  }

  if (existsSync(join(skillsDir, SKILL_MARKER))) {
    return [await loadSkill(skillsDir)];
  }

  const entries = await readdir(skillsDir, { withFileTypes: true });
  const skills: Skill[] = [];

  for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;

    const skillFile = join(skillsDir, entry.name, SKILL_MARKER);
    if (!existsSync(skillFile)) continue;

    try {
      const skill = await loadSkill(skillFile);
      skills.push(skill);
    } catch (error) {
      console.warn(`Failed to load skill "${entry.name}":`, error);
    }
  }

  return skills;
}
