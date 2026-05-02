import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  detectRowanRuntimeMode,
  findRowanSourceWorkspaceRoot,
  resolveInRowanWorkspace,
  resolveRowanWorkspacePaths,
  resolveWorkspacePath,
} from "../src";

test("source runtime resolves workspace to the project root", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-workspace-source-"));
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "rowan-agent", workspaces: ["packages/*"] }));
  await mkdir(join(root, "packages", "cli"), { recursive: true });

  expect(findRowanSourceWorkspaceRoot(join(root, "packages", "cli"))).toBe(root);

  const paths = resolveRowanWorkspacePaths({
    cwd: join(root, "packages", "cli"),
    env: {},
    execPath: "/usr/local/bin/bun",
  });
  expect(paths.mode).toBe("source");
  expect(paths.root).toBe(root);
  expect(paths.runsDir).toBe(join(root, "runs"));
  expect(paths.sessionsDir).toBe(join(root, "sessions"));
  expect(paths.skillsDir).toBe(join(root, "skills"));
});

test("binary runtime resolves workspace to ~/.rowan", () => {
  const paths = resolveRowanWorkspacePaths({
    env: {},
    execPath: "/usr/local/bin/rowan",
    homeDir: "/Users/tester",
  });

  expect(paths.mode).toBe("binary");
  expect(paths.root).toBe("/Users/tester/.rowan");
  expect(paths.runsDir).toBe("/Users/tester/.rowan/runs");
  expect(paths.sessionsDir).toBe("/Users/tester/.rowan/sessions");
  expect(paths.skillsDir).toBe("/Users/tester/.rowan/skills");
});

test("source runtime can resolve workspace from the running entrypoint path", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-workspace-entrypoint-"));
  const entrypointDir = join(root, "packages", "cli", "src");
  await mkdir(entrypointDir, { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "rowan-agent", workspaces: ["packages/*"] }));
  await writeFile(join(entrypointDir, "cli.ts"), "");

  const paths = resolveRowanWorkspacePaths({
    env: {},
    execPath: "/usr/local/bin/bun",
    entrypoint: join(entrypointDir, "cli.ts"),
  });

  expect(paths.root).toBe(root);
});

test("runtime and workspace env vars can override detection", () => {
  expect(detectRowanRuntimeMode({ env: { ROWAN_RUNTIME: "binary" }, execPath: "/usr/local/bin/bun" })).toBe(
    "binary",
  );

  const paths = resolveRowanWorkspacePaths({
    env: { ROWAN_WORKSPACE: "~/custom-rowan" },
    execPath: "/usr/local/bin/rowan",
    homeDir: "/Users/tester",
  });
  expect(paths.root).toBe("/Users/tester/custom-rowan");
});

test("relative paths resolve inside the workspace", () => {
  expect(resolveInRowanWorkspace("runs/example.jsonl", "/tmp/rowan")).toBe("/tmp/rowan/runs/example.jsonl");
  expect(resolveInRowanWorkspace("/var/tmp/example.jsonl", "/tmp/rowan")).toBe("/var/tmp/example.jsonl");
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
