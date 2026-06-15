import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AgentContextSkill as Skill } from "../protocol";
import { type WorkspacePaths, resolveWorkspacePaths } from "./env/path";
import {
  loadMarkdown,
  resolveResourcePath,
  inferResourceName,
} from "./loader";
import { formatResourceOutput } from "./context/resource-formatter";

const SKILL_MARKER = "SKILL.md";

export function resolveSkillPath(input: string, workspace = resolveWorkspacePaths()): string {
  return resolveResourcePath(input, "skills", SKILL_MARKER, workspace);
}

/** Format skill content for LLM consumption using unified XML format. */
export function readSkillContent(skill: Skill): string {
  return formatResourceOutput({
    type: "skill", name: skill.name, location: skill.filePath,
    content: skill.content, baseDir: skill.baseDir,
  });
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

export async function loadSkills(workspace?: WorkspacePaths, paths?: string[]): Promise<Skill[]> {
  if (paths && paths.length > 0) {
    return Promise.all(paths.map((path) => loadSkill(path, workspace)));
  }

  // Auto-discover from .rowan/skills/ directory
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
