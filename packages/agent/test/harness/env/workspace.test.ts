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
  await writeFile(skillPath, "---\ndescription: Use echo.\n---\n\n# Example\n\nUse echo.");

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
  expect(tools.map((tool) => tool.name)).toEqual(["read", "bash", "edit", "write"]);

  const context = createToolContext();
  const write = await findTool(tools, "write").execute(
    { path: "src/output.txt", content: "needle\n" },
    context,
  );
  expect(write.ok).toBe(true);
  expect(write.content).toContain("src/output.txt");

  const read = await findTool(tools, "read").execute({ path: "src/output.txt" }, context);
  expect(read.ok).toBe(true);
  expect(JSON.stringify(read.content)).toContain("needle");

  const edit = await findTool(tools, "edit").execute(
    { path: "src/output.txt", edits: [{ oldText: "needle", newText: "changed" }] },
    context,
  );
  expect(edit.ok).toBe(true);
  expect(JSON.stringify(edit.content)).toContain("replaced 1 block");

  const bash = await findTool(tools, "bash").execute(
    { command: "cat src/output.txt" },
    context,
  );
  expect(bash.ok).toBe(true);
  expect(bash.content).toBe("changed\n");
});

test("core tool schemas expose only the compact coding interface", () => {
  const tools = createCoreTools();
  const properties = (name: string): string[] => {
    const tool = findTool(tools, name);
    return Object.keys((tool.parameters as { properties: Record<string, unknown> }).properties);
  };

  expect(properties("read")).toEqual(["path", "offset", "limit"]);
  expect(properties("write")).toEqual(["path", "content"]);
  expect(properties("edit")).toEqual(["path", "edits"]);
  expect(properties("bash")).toEqual(["command", "timeout"]);
});

test("read supports line ranges and edit batches replacements", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-core-tools-compact-"));
  await writeFile(join(root, "range.txt"), "one\ntwo\nthree\nfour\n", "utf8");
  const tools = createCoreTools({ root });
  const context = createToolContext();

  const read = await findTool(tools, "read").execute(
    { path: "range.txt", offset: 2, limit: 2 },
    context,
  );
  expect(JSON.stringify(read.content)).toContain("two\\nthree");

  const edit = await findTool(tools, "edit").execute(
    {
      path: "range.txt",
      edits: [
        { oldText: "one", newText: "1" },
        { oldText: "four", newText: "4" },
      ],
    },
    context,
  );
  expect(edit.ok).toBe(true);
  expect(edit.content).toContain("replaced 2 block");
});

test("core tools block paths outside the workspace root", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-core-tools-root-"));
  const read = findTool(createCoreTools({ root }), "read");

  await expect(read.execute({ path: "../outside.txt" }, createToolContext())).rejects.toThrow(
    "Path escapes workspace root",
  );
});

test("edit requires each replacement to match exactly once", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-core-tools-edit-"));
  await writeFile(join(root, "repeat.txt"), "same\nsame\n", "utf8");
  const edit = findTool(createCoreTools({ root }), "edit");

  const ambiguous = await edit.execute(
    { path: "repeat.txt", edits: [{ oldText: "same", newText: "next" }] },
    createToolContext(),
  );
  expect(ambiguous.ok).toBe(false);
  expect(ambiguous.error).toContain("appears 2 times");

  const precise = await edit.execute(
    { path: "repeat.txt", edits: [{ oldText: "same\nsame", newText: "next\nnext" }] },
    createToolContext(),
  );
  expect(precise.ok).toBe(true);
  expect(precise.content).toContain("replaced 1 block");
});
