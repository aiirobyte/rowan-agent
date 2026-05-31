import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSession } from "@rowan-agent/agent";
import {
  detectRuntimeMode,
  findSourceWorkspaceRoot,
  resolveInWorkspace,
  resolveWorkspacePaths,
  resolveWorkspacePath,
} from "../../../src/harness/env";
import { createId, type Tool, type ToolContext } from "../../../src/harness/types";
import { createCoreTools } from "../../../src/harness/tools";
import { loadSkill, resolveSkillPath } from "../../../src/harness/skills";

function createToolContext(toolCallId = createId("call")): ToolContext {
  const state = createSession({ systemPrompt: "test", input: "inspect" });
  return {
    state,
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

test("source runtime resolves workspace to the project root", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-workspace-source-"));
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "rowan-agent", workspaces: ["packages/*"] }));
  await mkdir(join(root, "packages", "cli"), { recursive: true });

  expect(findSourceWorkspaceRoot(join(root, "packages", "cli"))).toBe(root);

  const paths = resolveWorkspacePaths({
    cwd: join(root, "packages", "cli"),
    env: {},
    execPath: "/usr/local/bin/bun",
  });
  expect(paths.mode).toBe("source");
  expect(paths.cwd).toBe(root);
  expect(paths.rowanDir).toBe(join(root, ".rowan"));
  expect("runsDir" in paths).toBe(false);
  expect("sessionsDir" in paths).toBe(false);
  expect("skillsDir" in paths).toBe(false);
});

test("binary runtime resolves workspace to ~/.rowan", () => {
  const paths = resolveWorkspacePaths({
    env: {},
    execPath: "/usr/local/bin/rowan",
    homeDir: "/Users/tester",
  });

  expect(paths.mode).toBe("binary");
  expect(paths.cwd).toBe("/Users/tester");
  expect(paths.rowanDir).toBe("/Users/tester/.rowan");
});

test("source runtime can resolve workspace from the running entrypoint path", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-workspace-entrypoint-"));
  const entrypointDir = join(root, "packages", "cli", "src");
  await mkdir(entrypointDir, { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "rowan-agent", workspaces: ["packages/*"] }));
  await writeFile(join(entrypointDir, "cli.ts"), "");

  const paths = resolveWorkspacePaths({
    env: {},
    execPath: "/usr/local/bin/bun",
    entrypoint: join(entrypointDir, "cli.ts"),
  });

  expect(paths.cwd).toBe(root);
});

test("runtime and workspace env vars can override detection", () => {
  expect(detectRuntimeMode({ env: { ROWAN_RUNTIME: "binary" }, execPath: "/usr/local/bin/bun" })).toBe(
    "binary",
  );

  const paths = resolveWorkspacePaths({
    env: { ROWAN_WORKSPACE: "~/custom-rowan" },
    execPath: "/usr/local/bin/rowan",
    homeDir: "/Users/tester",
  });
  expect(paths.cwd).toBe("/Users/tester/custom-rowan");
  expect(paths.rowanDir).toBe("/Users/tester/custom-rowan/.rowan");
});

test("relative paths resolve inside the workspace", () => {
  expect(resolveInWorkspace("runs/example.jsonl", "/tmp/rowan")).toBe("/tmp/rowan/runs/example.jsonl");
  expect(resolveInWorkspace("/var/tmp/example.jsonl", "/tmp/rowan")).toBe("/var/tmp/example.jsonl");
});

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

  expect(skill.id).toBe("example");
  expect(session.skills[0]?.content).toContain("Use echo.");
  expect(session.messages.some((message) => message.content.includes("Use echo."))).toBe(false);
});

test("loadSkill resolves skill ids from the workspace skills directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-workspace-skill-"));
  const skillDir = join(root, ".rowan", "skills", "example");
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, "SKILL.md"), "# Example\n\nUse workspace skill.");

  const workspace = {
    mode: "source" as const,
    cwd: root,
    rowanDir: join(root, ".rowan"),
  };

  expect(resolveSkillPath("example", workspace)).toBe(join(skillDir, "SKILL.md"));

  const skill = await loadSkill("example", workspace);
  expect(skill.id).toBe("example");
  expect(skill.path).toBe(join(skillDir, "SKILL.md"));
  expect(skill.content).toContain("Use workspace skill.");
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
