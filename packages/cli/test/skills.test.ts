import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "bun:test";
import { loadSkill, resolveSkillPath } from "../src/skills";
import { createSession } from "@rowan-agent/agent/session";

test("loadSkill reads SKILL.md and infers id from parent directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-skill-"));
  const skillDir = join(root, "example");
  await mkdir(skillDir);
  const skillPath = join(skillDir, "SKILL.md");
  await writeFile(skillPath, "# Example\n\nUse echo.");

  const skill = await loadSkill(skillPath);
  const session = createSession({
    systemPrompt: "Test",
    userInput: "hello",
    skills: [skill],
  });

  expect(skill.id).toBe("example");
  expect(session.messages.some((message) => message.content.includes("Use echo."))).toBe(true);
});

test("loadSkill resolves skill ids from the workspace skills directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-workspace-skill-"));
  const skillDir = join(root, "skills", "example");
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, "SKILL.md"), "# Example\n\nUse workspace skill.");

  const workspace = {
    mode: "source" as const,
    root,
    runsDir: join(root, "runs"),
    skillsDir: join(root, "skills"),
  };

  expect(resolveSkillPath("example", workspace)).toBe(join(skillDir, "SKILL.md"));

  const skill = await loadSkill("example", workspace);
  expect(skill.id).toBe("example");
  expect(skill.path).toBe(join(skillDir, "SKILL.md"));
  expect(skill.content).toContain("Use workspace skill.");
});
