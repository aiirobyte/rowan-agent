import { expect, test } from "bun:test";
import type { PhaseRegistry } from "../src/harness/phases/types";
import {
  createExtensionRunner,
  loadExtensionFromFactory,
} from "../src/extensions";
import type { LoadedExtension } from "../src/extensions";

test("PhaseRegistry is Map-based with entryPhaseId", () => {
  const phases = new Map();
  phases.set("a", { id: "a", name: "A", description: "a phase", filePath: "", baseDir: "", content: "", buildPrompt: () => "" });
  phases.set("b", { id: "b", name: "B", description: "b phase", filePath: "", baseDir: "", content: "", buildPrompt: () => "" });

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
    resolvedPath: "<test>",
    name: "test",
    factory: (ctx) => {
      ctx.registerPhase({
        id: "custom",
        name: "Custom",
        description: "Custom phase",
        run: async () => ({ message: "done", route: "stop" }),
      });
    },
  };

  await runner.loadExtensions([ext]);
  runner.bind();

  const phases = runner.getPhases();
  expect(phases.some(p => p.id === "custom")).toBe(true);

  const registry = runner.createPhaseRegistry({ entryPhaseId: "custom" });
  expect(registry.entryPhaseId).toBe("custom");
  expect(registry.phases.has("custom")).toBe(true);
  expect(registry.phases.get("custom")?.name).toBe("Custom");
});

test("ExtensionRunner rejects duplicate phase ids", async () => {
  const runner = createExtensionRunner();

  const ext1: LoadedExtension = {
    path: "<test1>",
    resolvedPath: "<test1>",
    name: "test1",
    factory: (ctx) => {
      ctx.registerPhase({
        id: "dup",
        name: "Dup",
        description: "Duplicate",
        run: async () => ({ message: "", route: "stop" }),
      });
    },
  };

  const ext2: LoadedExtension = {
    path: "<test2>",
    resolvedPath: "<test2>",
    name: "test2",
    factory: (ctx) => {
      ctx.registerPhase({
        id: "dup",
        name: "Dup2",
        description: "Duplicate",
        run: async () => ({ message: "", route: "stop" }),
      });
    },
  };

  await runner.loadExtensions([ext1]);
  try {
    await runner.loadExtensions([ext2]);
    expect(true).toBe(false); // Should not reach here
  } catch (error) {
    expect((error as Error).message).toContain("Duplicate phase id");
  }
});
