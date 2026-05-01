import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefaultCriteria } from "../src/task";
import { createCoreTools } from "../src/tools";
import { createId, createSession, type Task, type Tool } from "../src/types";

function createToolContext(toolCallId = createId("call")) {
  const task: Task = {
    id: createId("task"),
    title: "Core tool task",
    instruction: "Use core tools",
    acceptanceCriteria: createDefaultCriteria("Core tools were used."),
    toolNames: [],
    skillIds: [],
    status: "pending",
    attempts: 0,
  };

  return {
    session: createSession({ systemPrompt: "test", userInput: "inspect" }),
    task,
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
