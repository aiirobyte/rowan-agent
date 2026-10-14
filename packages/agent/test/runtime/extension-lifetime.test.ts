import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  RuntimeBootstrapRegistry,
  RuntimeExtensionLifetime,
} from "../../src/runtime/extension-lifetime";
import { resolveConfigurationSnapshot } from "../../src/runtime/configuration-snapshot";
import { assembleRegisteredExtensions } from "../../src/runtime/extensions";
import type { ExtensionAPI, LoadedExtension } from "../../src/extensions";

const extension = (
  path: string,
  factory: LoadedExtension["factory"],
): LoadedExtension => ({ path, name: path, factory });

test("global Extension activation skips one failure and keeps successful contributions", async () => {
  const lifetime = new RuntimeExtensionLifetime();
  const result = await lifetime.activate([
    extension("good", (api) => {
      api.tools.register({
        name: "good_tool",
        description: "Good",
        parameters: { type: "object", properties: {} },
        execute: async () => ({ content: [{ type: "text", text: "good" }] }),
      });
    }),
    extension("bad", (api) => {
      api.tools.register({
        name: "bad_tool",
        description: "Bad",
        parameters: { type: "object", properties: {} },
        execute: async () => ({ content: [{ type: "text", text: "bad" }] }),
      });
      throw new Error("bad activation");
    }),
  ]);

  expect(result.active).toEqual(["good"]);
  expect(result.errors).toMatchObject([{ path: "bad", error: "bad activation" }]);
  expect(lifetime.tools().map(({ definition }) => definition.name)).toEqual(["good_tool"]);
  await lifetime.close();
});

test("global Extension activation freezes after bootstrap and disposes in reverse order", async () => {
  const disposed: string[] = [];
  const lifetime = new RuntimeExtensionLifetime();
  await lifetime.activate([
    extension("first", () => () => { disposed.push("first"); }),
    extension("second", () => () => { disposed.push("second"); }),
  ]);

  await expect(lifetime.activate([])).rejects.toMatchObject({ code: "extensions_frozen" });
  await lifetime.close();
  expect(disposed).toEqual(["second", "first"]);
  await lifetime.close();
});

test("Extension registers a Skill directory, appears in resolved Definition context by name, and unregister / disposal removes it", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "rowan-skill-ext-"));
  const skillDir = join(tempDir, "custom-skill");
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    join(skillDir, "SKILL.md"),
    "---\nname: custom-skill\ndescription: A custom extension skill.\n---\nSkill instructions.\n",
  );

  let capturedApi!: ExtensionAPI;
  const ext = extension("skill-ext", async (api) => {
    capturedApi = api;
    await api.skills.register(skillDir);
  });

  const lifetime = new RuntimeExtensionLifetime();
  const registry = new RuntimeBootstrapRegistry(lifetime);

  try {
    await registry.loadAgents({
      sourceId: "definitions",
      values: [{
        name: "test-agent",
        description: "Test agent",
        prompt: "Prompt",
        skills: ["custom-skill"],
      }],
    });

    const activation = await registry.loadExtensions([ext]);
    expect(activation.active).toEqual(["skill-ext"]);
    expect(lifetime.skills().map((s) => s.name)).toEqual(["custom-skill"]);

    // Appears in resolved Definition context (selected by name)
    const snapshot = resolveConfigurationSnapshot(registry, {
      identity: "test-run",
      definition: { name: "test-agent" },
      resourceView: { agents: ["definitions"], tools: [], skills: [], phases: [] },
      model: { provider: "mock", id: "mock" },
    });
    const assembly = assembleRegisteredExtensions(snapshot, registry.extensionRunner);
    expect(assembly.context.skills.map((s) => s.name)).toEqual(["custom-skill"]);
    expect(assembly.context.skills[0].description).toBe("A custom extension skill.");

    // Unregister removes it from the runner
    capturedApi.skills.unregister("custom-skill");
    expect(lifetime.skills()).toEqual([]);
    expect(registry.extensionRunner.getSkills().find((s) => s.name === "custom-skill")).toBeUndefined();

    // Re-register and verify disposal removes it
    await capturedApi.skills.register(skillDir);
    expect(lifetime.skills().map((s) => s.name)).toEqual(["custom-skill"]);
    await registry.closeExtensions();
    expect(lifetime.skills()).toEqual([]);
    expect(registry.extensionRunner.getSkills().find((s) => s.name === "custom-skill")).toBeUndefined();
  } finally {
    await rm(tempDir, { recursive: true, force: true });
    await lifetime.close();
  }
});
