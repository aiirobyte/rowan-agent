import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AgentContextSkill as Skill } from "../protocol";
import { type WorkspacePaths, resolveWorkspacePaths } from "./env/path";
import {
  parseFrontmatter,
  loadMarkdown,
  resolveResourcePath,
  inferResourceName,
} from "./loader";

const SKILL_MARKER = "SKILL.md";

export function resolveSkillPath(input: string, workspace = resolveWorkspacePaths()): string {
  return resolveResourcePath(input, "skills", SKILL_MARKER, workspace);
}

/** Format a skill invocation prompt, optionally appending additional user instructions. */
export function formatSkillInvocation(skill: Skill, additionalInstructions?: string): string {
  const skillBlock = `<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir}.\n\n${skill.content}\n</skill>`;
  return additionalInstructions ? `${skillBlock}\n\n${additionalInstructions}` : skillBlock;
}

export async function loadSkill(path: string, workspace?: WorkspacePaths): Promise<Skill> {
  const resolved = resolveSkillPath(path, workspace);
  const { frontmatter, body } = await loadMarkdown(resolved);

  return {
    name: (frontmatter.name as string) ?? inferResourceName(resolved, SKILL_MARKER),
    description: (frontmatter.description as string) ?? "",
    filePath: resolved,
    baseDir: dirname(resolved),
    content: body,
    disableModelInvocation: (frontmatter["disable-model-invocation"] as string) === "true",
  };
}

export async function loadSkills(paths: string[] = [], workspace?: WorkspacePaths): Promise<Skill[]> {
  return Promise.all(paths.map((path) => loadSkill(path, workspace)));
}

/**
 * Discover and load all skills from .rowan/skills/ directory.
 *
 * Scans for subdirectories containing SKILL.md files.
 * Returns an array of loaded Skill objects.
 */
export async function loadAllSkills(workspace?: WorkspacePaths): Promise<Skill[]> {
  const ws = workspace ?? resolveWorkspacePaths();
  const skillsDir = join(ws.rowanDir, "skills");

  if (!existsSync(skillsDir)) {
    return [];
  }

  const entries = await readdir(skillsDir, { withFileTypes: true });
  const skills: Skill[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillFile = join(skillsDir, entry.name, SKILL_MARKER);
    if (!existsSync(skillFile)) continue;

    try {
      const skill = await loadSkill(entry.name, ws);
      skills.push(skill);
    } catch (error) {
      console.warn(`Failed to load skill "${entry.name}":`, error);
    }
  }

  return skills;
}
