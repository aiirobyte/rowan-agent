import { dirname } from "node:path";
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

export async function loadSkill(path: string, workspace?: WorkspacePaths): Promise<Skill> {
  const resolved = resolveSkillPath(path, workspace);
  const { frontmatter } = await loadMarkdown(resolved);

  return {
    name: (frontmatter.name as string) ?? inferResourceName(resolved, SKILL_MARKER),
    description: (frontmatter.description as string) ?? "",
    filePath: resolved,
    baseDir: dirname(resolved),
    disableModelInvocation: (frontmatter["disable-model-invocation"] as string) === "true",
  };
}

export async function loadSkills(paths: string[] = [], workspace?: WorkspacePaths): Promise<Skill[]> {
  return Promise.all(paths.map((path) => loadSkill(path, workspace)));
}
