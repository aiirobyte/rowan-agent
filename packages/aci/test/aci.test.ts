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

test("workspace list ignores Rowan runtime runs directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-aci-ignore-"));
  await mkdir(join(root, "runs"));
  await mkdir(join(root, ".rowan"));
  await writeFile(join(root, "visible.txt"), "ok", "utf8");
  await writeFile(join(root, "runs", "trace.jsonl"), "{}", "utf8");
  await writeFile(join(root, ".rowan", "old.jsonl"), "{}", "utf8");

  const list = await findTool(createWorkspaceTools({ root }), "workspace.list").execute(
    { recursive: true },
    createToolContext(),
  );

  expect(list.ok).toBe(true);
  const content = JSON.stringify(list.content);
  expect(content).toContain("visible.txt");
  expect(content).toContain(".rowan/old.jsonl");
  expect(content).not.toContain("trace.jsonl");
});

test("workspace list accepts the current working directory as root", async () => {
  const list = await findTool(createWorkspaceTools({ root: process.cwd() }), "workspace.list").execute(
    { path: ".", maxEntries: 5 },
    createToolContext(),
  );

  expect(list.ok).toBe(true);
  expect(JSON.stringify(list.content)).toContain('"path":"."');
});

test("workspace write and execute tools are opt-in", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-aci-gated-"));
  const readonlyTools = createWorkspaceTools({ root }).map((tool) => tool.name);
  expect(readonlyTools).not.toContain("workspace.patch");
  expect(readonlyTools).not.toContain("workspace.bash");

  const privilegedTools = createWorkspaceTools({
    root,
    allowWrite: true,
    allowExecute: true,
  }).map((tool) => tool.name);
  expect(privilegedTools).toContain("workspace.patch");
  expect(privilegedTools).toContain("workspace.bash");
});

test("workspace bash runs inside the workspace when execute access is enabled", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-aci-bash-"));
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src", "input.txt"), "hello", "utf8");

  const tools = createWorkspaceTools({
    root,
    allowExecute: true,
    maxBashOutputBytes: 64,
  });
  expect(tools.map((tool) => tool.name)).toContain("workspace.bash");

  const result = await findTool(tools, "workspace.bash").execute(
    { command: "cat input.txt", cwd: "src" },
    createToolContext(),
  );

  expect(result.ok).toBe(true);
  expect(JSON.stringify(result.content)).toContain('"cwd":"src"');
  expect(JSON.stringify(result.content)).toContain('"stdout":"hello"');
});

test("workspace bash reports output truncation", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-aci-bash-limit-"));
  const result = await findTool(
    createWorkspaceTools({
      root,
      allowExecute: true,
    }),
    "workspace.bash",
  ).execute({ command: "printf 123456", maxOutputBytes: 3 }, createToolContext());

  expect(result.ok).toBe(true);
  expect(JSON.stringify(result.content)).toContain('"stdout":"123"');
  expect(JSON.stringify(result.content)).toContain('"stdoutTruncated":true');
});
