import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSession } from "../../../src/harness/session/session";
import { messageContentText } from "../../../src/types";
import { resolveWorkspacePath } from "../../../src/harness/path";
import { type Tool, type ToolContext } from "../../../src/types";
import { createId } from "../../../src/utils";
import { createCoreTools } from "../../../src/harness/tools";
import { loadSkill, loadSkills } from "../../../src/harness/skills";

function createToolContext(toolCallId = createId("call")): ToolContext {
  return {
    skills: [],
    toolCallId,
  };
}

function findTool(tools: Tool[], name: string): Tool {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) {
    throw new Error(`Missing tool: ${name}`);
  }
  return tool;
}

test("workspace paths resolve safely inside the current working directory", () => {
  const root = process.cwd();

  expect(resolveWorkspacePath({ root }, ".").relativePath).toBe(".");
  expect(resolveWorkspacePath({ root }, "").relativePath).toBe(".");
  expect(resolveWorkspacePath({ root }, "/").relativePath).toBe(".");
  expect(resolveWorkspacePath({ root }, "packages").relativePath).toBe("packages");
  expect(() => resolveWorkspacePath({ root }, "../outside.txt")).toThrow("Path escapes workspace root");
  expect(() => resolveWorkspacePath({ root }, "/tmp/outside.txt")).toThrow("Path escapes workspace root");
});

test("loadSkill reads SKILL.md and infers id from parent directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-skill-"));
  const skillDir = join(root, "example");
  await mkdir(skillDir);
  const skillPath = join(skillDir, "SKILL.md");
  await writeFile(skillPath, "# Example\n\nUse echo.");

  const skill = await loadSkill(skillPath);
  const session = createSession({
    systemPrompt: "Test",
    input: "hello",
    skills: [skill],
  });

  expect(skill.name).toBe("example");
  expect(session.skills[0]?.name).toBe("example");
  expect(session.messages.some((message) => messageContentText(message.content).includes("Use echo."))).toBe(false);
});

test("loadSkills loads every skill from the target directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-workspace-skill-"));
  const skillDir = join(root, ".rowan", "skills", "example");
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, "SKILL.md"), "---\ndescription: Use workspace skill.\n---\n\n# Example\n\nUse workspace skill.");

  const [skill] = await loadSkills(join(root, ".rowan", "skills"));
  expect(skill.name).toBe("example");
  expect(skill.filePath).toBe(join(skillDir, "SKILL.md"));
  expect(skill.description).toBeTruthy();
});

test("core tools expose read, write, edit, and bash", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-core-tools-"));
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src", "input.txt"), "alpha\n", "utf8");

  const tools = createCoreTools({ root, maxBashOutputBytes: 64 });
  expect(tools.map((tool) => tool.name)).toEqual(["read", "write", "edit", "bash"]);

  const context = createToolContext();
  const write = await findTool(tools, "write").execute(
    { path: "src/output.txt", content: "needle\n" },
    context,
  );
  expect(write.ok).toBe(true);
  expect(JSON.stringify(write.content)).toContain('"path":"src/output.txt"');

  const read = await findTool(tools, "read").execute({ path: "src/output.txt" }, context);
  expect(read.ok).toBe(true);
  expect(JSON.stringify(read.content)).toContain("needle");

  const edit = await findTool(tools, "edit").execute(
    { path: "src/output.txt", oldText: "needle", newText: "changed" },
    context,
  );
  expect(edit.ok).toBe(true);
  expect(JSON.stringify(edit.content)).toContain('"replacements":1');

  const bash = await findTool(tools, "bash").execute(
    { command: "cat output.txt", cwd: "src" },
    context,
  );
  expect(bash.ok).toBe(true);
  expect(JSON.stringify(bash.content)).toContain('"cwd":"src"');
  expect(JSON.stringify(bash.content)).toContain('"stdout":"changed\\n"');
});

test("core tools block paths outside the workspace root", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-core-tools-root-"));
  const read = findTool(createCoreTools({ root }), "read");

  await expect(read.execute({ path: "../outside.txt" }, createToolContext())).rejects.toThrow(
    "Path escapes workspace root",
  );
});

test("edit refuses ambiguous replacements unless replaceAll is true", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-core-tools-edit-"));
  await writeFile(join(root, "repeat.txt"), "same\nsame\n", "utf8");
  const edit = findTool(createCoreTools({ root }), "edit");

  const ambiguous = await edit.execute(
    { path: "repeat.txt", oldText: "same", newText: "next" },
    createToolContext(),
  );
  expect(ambiguous.ok).toBe(false);
  expect(ambiguous.error).toContain("appears 2 times");

  const replaceAll = await edit.execute(
    { path: "repeat.txt", oldText: "same", newText: "next", replaceAll: true },
    createToolContext(),
  );
  expect(replaceAll.ok).toBe(true);
  expect(JSON.stringify(replaceAll.content)).toContain('"replacements":2');
});
