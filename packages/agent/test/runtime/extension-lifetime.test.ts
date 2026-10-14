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

test("Post-activation registrations and unregistrations reach the Registry and reflect in new snapshots", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "rowan-live-ext-"));
  const initialSkillDir = join(tempDir, "initial-skill");
  const freshSkillDir = join(tempDir, "fresh-skill");
  await mkdir(initialSkillDir, { recursive: true });
  await mkdir(freshSkillDir, { recursive: true });
  await writeFile(
    join(initialSkillDir, "SKILL.md"),
    "---\nname: initial-skill\ndescription: Initial skill.\n---\nInitial content.\n",
  );
  await writeFile(
    join(freshSkillDir, "SKILL.md"),
    "---\nname: fresh-skill\ndescription: Fresh skill.\n---\nFresh content.\n",
  );

  let capturedApi!: ExtensionAPI;
  const ext = extension("live-ext", async (api) => {
    capturedApi = api;
    api.tools.register({
      name: "initial_tool",
      description: "Initial tool description",
      parameters: { type: "object" },
      execute: async () => ({ content: [{ type: "text", text: "ok" }] }),
    });
    await api.skills.register(initialSkillDir);
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
      }],
    });

    await registry.loadExtensions([ext]);

    const initialSnapshot = resolveConfigurationSnapshot(registry, {
      identity: "run-1",
      definition: { name: "test-agent" },
      resourceView: { agents: ["definitions"], tools: [], skills: [], phases: [] },
      model: { provider: "mock", id: "mock" },
    });

    expect(initialSnapshot.resources.tools.some((t) => t.name === "initial_tool")).toBe(true);
    expect(initialSnapshot.resources.skills.some((s) => s.name === "initial-skill")).toBe(true);

    // From a config-changed-style callback after activation:
    capturedApi.config.changed(async () => {
      capturedApi.tools.unregister("initial_tool");
      capturedApi.skills.unregister("initial-skill");
      await capturedApi.skills.register(freshSkillDir);
    });

    // Trigger config change
    await registry.extensionRunner.notifyConfigChanged("live-ext", []);

    // Freshly resolved configuration snapshot reflects the update
    const updatedSnapshot = resolveConfigurationSnapshot(registry, {
      identity: "run-2",
      definition: { name: "test-agent" },
      resourceView: { agents: ["definitions"], tools: [], skills: [], phases: [] },
      model: { provider: "mock", id: "mock" },
    });

    expect(updatedSnapshot.resources.tools.some((t) => t.name === "initial_tool")).toBe(false);
    expect(updatedSnapshot.resources.skills.some((s) => s.name === "initial-skill")).toBe(false);
    expect(updatedSnapshot.resources.skills.some((s) => s.name === "fresh-skill")).toBe(true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
    await lifetime.close();
  }
});
