import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ResourceRegistry,
  type ResourceView,
} from "../../src/runtime/resource-registry";

const emptyView = (tools: readonly string[] = []): ResourceView => ({
  agents: [],
  tools,
  skills: [],
  phases: [],
});

const tool = (name: string) => ({
  name,
  description: `${name} tool`,
  parameters: { type: "object", properties: {} },
  execute: async () => ({ ok: true as const, content: null }),
});

test("source transaction rejects duplicates without changing the previous revision", async () => {
  const registry = new ResourceRegistry();
  await registry.loadTools({ sourceId: "project-a", values: [tool("keep")] });

  await expect(registry.loadTools({
    sourceId: "project-a",
    values: [tool("keep"), tool("keep")],
  })).rejects.toMatchObject({ code: "resource_collision" });

  const resolved = registry.resolveView(emptyView(["project-a"]));
  expect(resolved.tools.map(({ name }) => name)).toEqual(["keep"]);
});

test("replacing one source atomically removes stale resources", async () => {
  const registry = new ResourceRegistry();
  await registry.loadTools({ sourceId: "project-a", values: [tool("old"), tool("keep")] });
  const result = await registry.loadTools({ sourceId: "project-a", values: [tool("new")] });

  expect(result.registered.map(({ name }) => name)).toEqual(["new"]);
  expect(registry.resolveView(emptyView(["project-a"])).tools.map(({ name }) => name)).toEqual(["new"]);
});

test("same-kind names may coexist in separate sources but collide in one view", async () => {
  const registry = new ResourceRegistry();
  await registry.loadTools({ sourceId: "project-a", values: [tool("review")] });
  await registry.loadTools({ sourceId: "project-b", values: [tool("review")] });

  expect(registry.resolveView(emptyView(["project-a"])).tools.map(({ name }) => name)).toEqual(["review"]);
  expect(registry.resolveView(emptyView(["project-b"])).tools.map(({ name }) => name)).toEqual(["review"]);
  expect(() => registry.resolveView(emptyView(["project-a", "project-b"])))
    .toThrow(/Duplicate Tool resource "review"/);
});

test("unload removes one complete source and leaves unrelated sources intact", async () => {
  const registry = new ResourceRegistry();
  await registry.loadTools({ sourceId: "project-a", values: [tool("a")] });
  await registry.loadTools({ sourceId: "project-b", values: [tool("b")] });

  await registry.unload({ kind: "tool", sourceId: "project-a" });

  expect(() => registry.resolveView(emptyView(["project-a"]))).toThrow(/Unknown resource source/);
  expect(registry.resolveView(emptyView(["project-b"])).tools.map(({ name }) => name)).toEqual(["b"]);
});

test("directory and inline values commit as one source and skip only invalid siblings", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-registry-"));
  try {
    await mkdir(join(root, "good"));
    await mkdir(join(root, "bad"));
    await writeFile(join(root, "good", "SKILL.md"), "---\nname: good\ndescription: Good\n---\nGood body.\n");
    await writeFile(join(root, "bad", "SKILL.md"), "---\nname: bad\n---\nMissing description.\n");

    const registry = new ResourceRegistry();
    const result = await registry.loadSkills({
      sourceId: "project-a",
      directory: root,
      values: [{
        name: "inline",
        description: "Inline",
        filePath: "<inline>",
        baseDir: "<inline>",
        content: "Inline body.",
        disableModelInvocation: false,
      }],
    });

    expect(result.registered.map(({ name }) => name)).toEqual(["good", "inline"]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.kind).toBe("invalid");
    expect(registry.resolveView(emptyView()).skills.map(({ name }) => name)).toEqual([]);
    expect(registry.resolveView({ agents: [], tools: [], skills: ["project-a"], phases: [] }).skills.map(({ name }) => name))
      .toEqual(["good", "inline"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a missing directory commits an empty source with a diagnostic", async () => {
  const registry = new ResourceRegistry();
  const result = await registry.loadSkills({
    sourceId: "missing",
    directory: join(tmpdir(), "rowan-registry-does-not-exist"),
  });

  expect(result.registered).toEqual([]);
  expect(result.skipped).toMatchObject([{ kind: "missing", sourceId: "missing" }]);
  expect(registry.resolveView({ agents: [], tools: [], skills: ["missing"], phases: [] }).skills).toEqual([]);
});

test("a duplicate between directory and inline values rejects the entire replacement", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-registry-"));
  try {
    await mkdir(join(root, "review"));
    await writeFile(join(root, "review", "SKILL.md"), "---\nname: review\ndescription: Review\n---\nReview body.\n");
    const registry = new ResourceRegistry();
    await registry.loadSkills({
      sourceId: "project-a",
      values: [{
        name: "keep",
        description: "Keep",
        filePath: "<inline>",
        baseDir: "<inline>",
        content: "Keep body.",
        disableModelInvocation: false,
      }],
    });

    await expect(registry.loadSkills({
      sourceId: "project-a",
      directory: root,
      values: [{
        name: "review",
        description: "Duplicate",
        filePath: "<inline>",
        baseDir: "<inline>",
        content: "Duplicate body.",
        disableModelInvocation: false,
      }],
    })).rejects.toMatchObject({ code: "resource_collision" });

    expect(registry.resolveView({ agents: [], tools: [], skills: ["project-a"], phases: [] }).skills.map(({ name }) => name))
      .toEqual(["keep"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
