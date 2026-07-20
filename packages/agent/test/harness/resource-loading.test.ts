import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSkill, loadSkills } from "../../src/harness/skills";
import { loadPhase, loadPhases } from "../../src/harness/phases";

async function createResourceDir(prefix: string, resource: string, id: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const dir = join(root, id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, resource), "");
  return root;
}

test("Skill metadata follows Pi fallback and warning-compatible loading", async () => {
  const root = await createResourceDir("rowan-skill-metadata-", "SKILL.md", "valid-skill");
  try {
    const skillPath = join(root, "valid-skill", "SKILL.md");
    await writeFile(skillPath, `---
name: Legacy Skill Name
description: A valid description.
disable-model-invocation: true
---

Skill body.
`);

    const skill = await loadSkill(skillPath);
    expect(skill.name).toBe("Legacy Skill Name");
    expect("id" in skill).toBe(false);
    expect(skill.description).toBe("A valid description.");
    expect(skill.disableModelInvocation).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Skills with missing descriptions are skipped by batch loading", async () => {
  const root = await createResourceDir("rowan-skill-description-", "SKILL.md", "missing-description");
  try {
    const skillPath = join(root, "missing-description", "SKILL.md");
    await writeFile(skillPath, "---\nname: missing-description\n---\nSkill body.");

    await expect(loadSkill(skillPath)).rejects.toThrow("description is required");
    expect(await loadSkills(root)).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Invalid Skill IDs and long descriptions warn but still load", async () => {
  const root = await createResourceDir("rowan-skill-invalid-id-", "SKILL.md", "Bad_ID");
  try {
    const skillPath = join(root, "Bad_ID", "SKILL.md");
    await writeFile(skillPath, `---
name: Bad_ID
description: ${"x".repeat(1025)}
---
Skill body.
`);

    const skill = await loadSkill(skillPath);
    expect(skill.name).toBe("Bad_ID");
    expect(skill.description.length).toBe(1025);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Phase metadata falls back to its directory name and preserves explicit names", async () => {
  const root = await createResourceDir("rowan-phase-metadata-", "PHASE.md", "review-phase");
  try {
    const phasePath = join(root, "review-phase", "PHASE.md");
    await writeFile(phasePath, `---
description: A valid phase description.
---

Phase body.
`);

    const phase = await loadPhase(phasePath);
    expect(phase.name).toBe("review-phase");
    expect("id" in phase).toBe(false);

    await writeFile(phasePath, `---
name: Legacy Phase Name
description: A valid phase description.
---

Phase body.
`);
    const namedPhase = await loadPhase(phasePath);
    expect(namedPhase.name).toBe("Legacy Phase Name");
    expect("id" in namedPhase).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Phases with missing descriptions are skipped by batch loading", async () => {
  const root = await createResourceDir("rowan-phase-description-", "PHASE.md", "missing-description");
  try {
    const phasePath = join(root, "missing-description", "PHASE.md");
    await writeFile(phasePath, "---\nname: missing-description\n---\nPhase body.");

    await expect(loadPhase(phasePath)).rejects.toThrow("description is required");
    expect((await loadPhases(root)).phases.size).toBe(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
