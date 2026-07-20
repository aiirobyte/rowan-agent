import { existsSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { Skill } from "../protocol";
import {
  loadMarkdown,
  FrontmatterParseError,
  inferResourceName,
} from "./loader";
import { formatResourceOutput } from "./context/resource-formatter";
import {
  ResourceMetadataError,
  validateDescription,
  validateResourceId,
  validateResourceName,
  warnResourceDiagnostics,
} from "./resource-validation";

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
  let loaded: Awaited<ReturnType<typeof loadMarkdown>>;
  try {
    loaded = await loadMarkdown(resolved);
  } catch (error) {
    if (!(error instanceof FrontmatterParseError)) throw error;
    warnResourceDiagnostics("skill", resolved, [`frontmatter could not be parsed: ${error.message}`]);
    throw new ResourceMetadataError("parse_failed", error.message);
  }

  const { frontmatter, body } = loaded;
  const metadata = frontmatter as Record<string, unknown>;
  const id = inferResourceName(resolved, SKILL_MARKER);
  const frontmatterName = typeof metadata.name === "string" ? metadata.name : undefined;
  const name = frontmatterName || id;
  const description = validateDescription(metadata.description);
  const diagnostics = validateResourceId(id);
  if (frontmatterName && frontmatterName !== id) {
    diagnostics.push(...validateResourceName(frontmatterName, id));
  }
  diagnostics.push(...description.warnings);
  warnResourceDiagnostics("skill", resolved, diagnostics);

  if (description.missing) {
    throw new ResourceMetadataError("invalid_metadata", "description is required");
  }

  return {
    name,
    description: description.description!,
    filePath: resolved,
    baseDir: dirname(resolved),
    content: body,
    disableModelInvocation: metadata["disable-model-invocation"] === true,
  };
}

export async function loadSkills(targetPath: string): Promise<Skill[]> {
  const skillsDir = resolve(targetPath);

  if (existsSync(skillsDir) && statSync(skillsDir).isFile()) {
    try {
      return [await loadSkill(skillsDir)];
    } catch (error) {
      if (error instanceof ResourceMetadataError) return [];
      throw error;
    }
  }

  if (existsSync(join(skillsDir, SKILL_MARKER))) {
    try {
      return [await loadSkill(skillsDir)];
    } catch (error) {
      if (error instanceof ResourceMetadataError) return [];
      throw error;
    }
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
      if (error instanceof ResourceMetadataError) continue;
      console.warn(`Failed to load skill "${entry.name}":`, error);
    }
  }

  return skills;
}
