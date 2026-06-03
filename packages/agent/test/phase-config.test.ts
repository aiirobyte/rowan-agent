import { expect, test } from "bun:test";
import {
  createPhaseRegistry,
  resolvePhaseEntry,
  ensurePhaseRegistry,
} from "../src/loop/phases";
import type { PhaseRegistry, PhaseDefinition } from "../src/loop/phases";
import {
  createExtensionRunner,
  loadExtensionFromFactory,
} from "../src/extensions";
import type { LoadedExtension } from "../src/extensions";

function stubPhase(id: string): PhaseDefinition {
  return {
    id,
    name: id,
    description: `${id} phase`,
    run: async () => ({ message: "", route: "stop" }),
  };
}

test("ensurePhaseRegistry accepts a valid registry", () => {
  const registry: PhaseRegistry = {
    entryPhaseId: "a",
    phases: [stubPhase("a"), stubPhase("b")],
  };

  expect(() => ensurePhaseRegistry(registry)).not.toThrow();
});

test("ensurePhaseRegistry rejects empty entryPhaseId", () => {
  const registry: PhaseRegistry = {
    entryPhaseId: "",
    phases: [stubPhase("a")],
  };

  expect(() => ensurePhaseRegistry(registry)).toThrow("non-empty entryPhaseId");
});

test("ensurePhaseRegistry rejects empty phases array", () => {
  const registry: PhaseRegistry = {
    entryPhaseId: "a",
    phases: [],
  };

  expect(() => ensurePhaseRegistry(registry)).toThrow("at least one phase definition");
});

test("ensurePhaseRegistry rejects phase with empty id", () => {
  const registry: PhaseRegistry = {
    entryPhaseId: "a",
    phases: [{ id: "", name: "empty", description: "", run: async () => ({ message: "", route: "stop" }) }],
  };

  expect(() => ensurePhaseRegistry(registry)).toThrow("non-empty id");
});

test("ensurePhaseRegistry rejects duplicate phase ids", () => {
  const registry: PhaseRegistry = {
    entryPhaseId: "a",
    phases: [stubPhase("a"), stubPhase("a")],
  };

  expect(() => ensurePhaseRegistry(registry)).toThrow("Duplicate phase id");
});

test("ensurePhaseRegistry rejects entryPhaseId not in phases", () => {
  const registry: PhaseRegistry = {
    entryPhaseId: "missing",
    phases: [stubPhase("a")],
  };

  expect(() => ensurePhaseRegistry(registry)).toThrow("Entry phase id");
});

test("resolvePhaseEntry returns phase by id", () => {
  const registry: PhaseRegistry = {
    entryPhaseId: "a",
    phases: [stubPhase("a"), stubPhase("b")],
  };

  const phase = resolvePhaseEntry(registry, "b");
  expect(phase.id).toBe("b");
});

test("resolvePhaseEntry throws for missing phase", () => {
  const registry: PhaseRegistry = {
    entryPhaseId: "a",
    phases: [stubPhase("a")],
  };

  expect(() => resolvePhaseEntry(registry, "missing")).toThrow("is not defined in the phase registry");
});

test("createPhaseRegistry validates and normalizes", () => {
  const registry = createPhaseRegistry({
    entryPhaseId: "a",
    phases: [stubPhase("a"), stubPhase("b")],
  });

  expect(registry.entryPhaseId).toBe("a");
  expect(registry.phases).toHaveLength(2);
});

test("createPhaseRegistry rejects invalid input", () => {
  expect(() => createPhaseRegistry({
    entryPhaseId: "",
    phases: [],
  })).toThrow();
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
  expect(registry.phases.some(p => p.id === "custom")).toBe(true);
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
