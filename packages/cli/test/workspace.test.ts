import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  findSourceWorkspaceRoot,
  resolveInWorkspace,
  resolveWorkspacePaths,
} from "../src/workspace";

test("workspace paths resolve to the project root", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-workspace-root-"));
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "rowan-agent", workspaces: ["packages/*"] }));
  await mkdir(join(root, "packages", "cli"), { recursive: true });

  expect(findSourceWorkspaceRoot(join(root, "packages", "cli"))).toBe(root);

  const paths = resolveWorkspacePaths({ cwd: join(root, "packages", "cli"), env: {} });
  expect(paths.cwd).toBe(root);
  expect(paths.rowanDir).toBe(join(root, ".rowan"));
});

test("workspace resolution uses cwd", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-workspace-cwd-"));
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "rowan-agent", workspaces: ["packages/*"] }));
  expect(resolveWorkspacePaths({ cwd: root, env: {} }).cwd).toBe(root);
});

test("workspace env var can override the workspace root", () => {
  const homeDir = join(tmpdir(), "rowan-test-home");
  const paths = resolveWorkspacePaths({
    env: { ROWAN_WORKSPACE: "~/custom-rowan" },
    homeDir,
  });
  expect(paths.cwd).toBe(join(homeDir, "custom-rowan"));
  expect(paths.rowanDir).toBe(join(homeDir, "custom-rowan", ".rowan"));
});

test("project rowan dir can be customized without escaping the workspace", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-workspace-rowan-dir-"));
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "rowan-agent", workspaces: ["packages/*"] }));

  expect(resolveWorkspacePaths({ cwd: root, env: {}, rowanDir: ".rowan-project" }).rowanDir)
    .toBe(join(root, ".rowan-project"));
  expect(resolveWorkspacePaths({ cwd: root, env: {}, rowanDir: "" }).rowanDir)
    .toBe(join(root, ".rowan"));
  expect(() => resolveWorkspacePaths({ cwd: root, env: {}, rowanDir: join(root, ".rowan-absolute") }))
    .toThrow("Project Rowan dir must be a relative path");
  expect(() => resolveWorkspacePaths({ cwd: root, env: {}, rowanDir: "../outside" }))
    .toThrow("Path escapes workspace root");
});

test("relative paths resolve from the workspace", () => {
  const root = join(tmpdir(), "rowan");
  const absolutePath = join(tmpdir(), "rowan-example.jsonl");
  expect(resolveInWorkspace("runs/example.jsonl", root)).toBe(join(root, "runs", "example.jsonl"));
  expect(resolveInWorkspace(absolutePath, root)).toBe(absolutePath);
});
