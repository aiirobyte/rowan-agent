import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSession, createDefaultCriteria, createId, type Task, type Tool } from "@rowan-agent/agent";
import { createWorkspaceTools, resolveWorkspacePath } from "../src";

function createToolContext(toolCallId = createId("call")) {
  const task: Task = {
    id: createId("task"),
    title: "Workspace task",
    instruction: "Inspect workspace",
    acceptanceCriteria: createDefaultCriteria("Workspace was inspected."),
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

test("workspace read-only tools list, read, search, and diff within root", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-aci-"));
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src", "hello.txt"), "alpha\nneedle\nomega\n", "utf8");

  const tools = createWorkspaceTools({ root });
  expect(tools.map((tool) => tool.name)).toEqual([
    "workspace.list",
    "workspace.read",
    "workspace.search",
    "workspace.diff",
  ]);

  const context = createToolContext();
  const list = await findTool(tools, "workspace.list").execute({ path: "src" }, context);
  expect(list.ok).toBe(true);
  expect(JSON.stringify(list.content)).toContain("src/hello.txt");

  const read = await findTool(tools, "workspace.read").execute({ path: "src/hello.txt" }, context);
  expect(read.ok).toBe(true);
  expect(JSON.stringify(read.content)).toContain("needle");

  const search = await findTool(tools, "workspace.search").execute({ query: "needle" }, context);
  expect(search.ok).toBe(true);
  expect(JSON.stringify(search.content)).toContain("\"line\":2");

  const diff = await findTool(tools, "workspace.diff").execute(
    { path: "src/hello.txt", content: "alpha\nchanged\nomega\n" },
    context,
  );
  expect(diff.ok).toBe(true);
  expect(JSON.stringify(diff.content)).toContain("-needle");
  expect(JSON.stringify(diff.content)).toContain("+changed");
});

test("workspace path resolution blocks traversal outside root", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-aci-root-"));
  expect(() => resolveWorkspacePath({ root }, "../outside.txt")).toThrow("Path escapes workspace root");
});

test("workspace write and execute tools are opt-in", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-aci-gated-"));
  const readonlyTools = createWorkspaceTools({ root }).map((tool) => tool.name);
  expect(readonlyTools).not.toContain("workspace.patch");
  expect(readonlyTools).not.toContain("workspace.test");

  const privilegedTools = createWorkspaceTools({
    root,
    allowWrite: true,
    allowExecute: true,
    allowedTestCommands: ["echo ok"],
  }).map((tool) => tool.name);
  expect(privilegedTools).toContain("workspace.patch");
  expect(privilegedTools).toContain("workspace.test");
});
