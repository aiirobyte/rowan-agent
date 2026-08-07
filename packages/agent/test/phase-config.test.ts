import { expect, test } from "bun:test";
import type { PhaseRegistry } from "../src/harness/phases/types";
import { createExtensionRunner } from "../src/extensions";
import type { LoadedExtension } from "../src/extensions";

const phaseFixture = (name: string): string => `${process.cwd()}/packages/agent/test/fixtures/phases/${name}`;

test("PhaseRegistry is Map-based with entryPhaseId", () => {
  const phases = new Map();
  phases.set("a", { name: "a", description: "a phase", filePath: "", baseDir: "", content: "" });
  phases.set("b", { name: "b", description: "b phase", filePath: "", baseDir: "", content: "" });

  const registry: PhaseRegistry = { phases, entryPhaseId: "a" };
  expect(registry.entryPhaseId).toBe("a");
  expect(registry.phases.size).toBe(2);
  expect(registry.phases.has("a")).toBe(true);
  expect(registry.phases.has("b")).toBe(true);
});

test("PhaseRegistry supports null entryPhaseId", () => {
  const registry: PhaseRegistry = { phases: new Map(), entryPhaseId: null };
  expect(registry.entryPhaseId).toBeNull();
  expect(registry.phases.size).toBe(0);
});

test("ExtensionRunner loads phases from extensions", async () => {
  const runner = createExtensionRunner();

  const ext: LoadedExtension = {
    path: "<test>",
    name: "test",
    factory: async (ctx) => {
      await ctx.registerPhase(phaseFixture("custom"));
    },
  };

  await runner.loadExtensions([ext]);
  runner.bind();

  const phases = runner.getPhases();
  expect(phases.some(p => p.name === "custom")).toBe(true);
  expect("id" in phases.find((p) => p.name === "custom")!).toBe(false);

  const registry = runner.createPhaseRegistry({ entryPhaseId: "custom" });
  expect(registry.entryPhaseId).toBe("custom");
  expect(registry.phases.has("custom")).toBe(true);
  expect(registry.phases.get("custom")?.name).toBe("custom");
});

test("ExtensionRunner rejects duplicate phase names", async () => {
  const runner = createExtensionRunner();

  const ext1: LoadedExtension = {
    path: "<test1>",
    name: "test1",
    factory: async (ctx) => {
      await ctx.registerPhase(phaseFixture("dup"));
    },
  };

  const ext2: LoadedExtension = {
    path: "<test2>",
    name: "test2",
    factory: async (ctx) => {
      await ctx.registerPhase(phaseFixture("dup"));
    },
  };

  await runner.loadExtensions([ext1]);
  try {
    await runner.loadExtensions([ext2]);
    expect(true).toBe(false); // Should not reach here
  } catch (error) {
    expect((error as Error).message).toContain("Duplicate phase name");
  }
});

test("ExtensionRunner rejects a missing phase bundle", async () => {
  const runner = createExtensionRunner();
  const extension: LoadedExtension = {
    path: "<invalid>",
    name: "invalid",
    factory: async (ctx) => {
      await ctx.registerPhase(phaseFixture("missing"));
    },
  };

  await expect(runner.loadExtensions([extension])).rejects.toThrow();
});

test("ExtensionRunner requires a phase directory path", async () => {
  const runner = createExtensionRunner();
  const extension: LoadedExtension = {
    path: "<default-name>",
    name: "default-name",
    factory: async (ctx) => {
      await ctx.registerPhase("");
    },
  };

  await expect(runner.loadExtensions([extension])).rejects.toThrow("directory path");
});
