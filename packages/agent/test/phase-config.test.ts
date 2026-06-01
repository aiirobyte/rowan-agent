import { expect, test } from "bun:test";
import {
  createPhaseRegistry,
  resolvePhaseEntry,
  ensurePhaseRegistry,
} from "../src/loop/phases";
import type { PhaseRegistry, PhaseDefinition } from "../src/loop/phases";
import {
  createDefaultPhaseRegistry,
  createExtensionRuntime,
  ExtensionRunner,
  loadExtensionFromFactory,
} from "../src/extensions";

const testRuntime = createExtensionRuntime();

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
    phaseHandlers: new Map(),
  };

  expect(() => ensurePhaseRegistry(registry)).not.toThrow();
});

test("ensurePhaseRegistry rejects empty entryPhaseId", () => {
  const registry: PhaseRegistry = {
    entryPhaseId: "",
    phases: [stubPhase("a")],
    phaseHandlers: new Map(),
  };

  expect(() => ensurePhaseRegistry(registry)).toThrow("non-empty entryPhaseId");
});

test("ensurePhaseRegistry rejects empty phases array", () => {
  const registry: PhaseRegistry = {
    entryPhaseId: "a",
    phases: [],
    phaseHandlers: new Map(),
  };

  expect(() => ensurePhaseRegistry(registry)).toThrow("at least one phase definition");
});

test("ensurePhaseRegistry rejects phase with empty id", () => {
  const registry: PhaseRegistry = {
    entryPhaseId: "a",
    phases: [{ id: "", name: "", description: "", run: async () => ({ message: "", route: "stop" }) }],
    phaseHandlers: new Map(),
  };

  expect(() => ensurePhaseRegistry(registry)).toThrow("non-empty id");
});

test("ensurePhaseRegistry rejects duplicate phase ids", () => {
  const registry: PhaseRegistry = {
    entryPhaseId: "a",
    phases: [stubPhase("a"), stubPhase("a")],
    phaseHandlers: new Map(),
  };

  expect(() => ensurePhaseRegistry(registry)).toThrow("Duplicate phase id: a");
});

test("ensurePhaseRegistry rejects entryPhaseId not in phases", () => {
  const registry: PhaseRegistry = {
    entryPhaseId: "missing",
    phases: [stubPhase("a")],
    phaseHandlers: new Map(),
  };

  expect(() => ensurePhaseRegistry(registry)).toThrow("not defined in phases");
});

test("resolvePhase returns matching phase definition", () => {
  const phase = stubPhase("target");
  const registry: PhaseRegistry = {
    entryPhaseId: "target",
    phases: [stubPhase("other"), phase],
    phaseHandlers: new Map(),
  };

  expect(resolvePhaseEntry(registry, "target").phase).toBe(phase);
});

test("resolvePhaseEntry throws for unknown id", () => {
  const registry: PhaseRegistry = {
    entryPhaseId: "a",
    phases: [stubPhase("a")],
    phaseHandlers: new Map(),
  };

  expect(() => resolvePhaseEntry(registry, "missing")).toThrow("not defined in the phase registry");
});

test("createDefaultPhaseRegistry returns chat as the default phase id", async () => {
  const registry = await createDefaultPhaseRegistry();

  expect(registry.entryPhaseId).toBe("chat");
  expect(registry.phases.map((p) => p.id)).toEqual(["chat", "plan", "execute", "verify"]);
  expect(registry.phaseHandlers.has("chat")).toBe(true);
  expect(registry.phases[0]).toMatchObject({
    name: "Chat",
    description: expect.any(String),
  });
});

test("createDefaultPhaseRegistry passes validation", async () => {
  const registry = await createDefaultPhaseRegistry();

  expect(() => ensurePhaseRegistry(registry)).not.toThrow();
});

test("createPhaseRegistry composes phases directly", () => {
  const first = stubPhase("first");
  const second = stubPhase("second");

  const registry = createPhaseRegistry({
    entryPhaseId: "first",
    phases: [first, second],
  });

  expect(registry.entryPhaseId).toBe("first");
  expect(registry.phases).toEqual([first, second]);
  expect(resolvePhaseEntry(registry, "second").phase).toBe(second);
});

test("createPhaseRegistry uses first phase as default entry", () => {
  const registry = createPhaseRegistry({
    phases: [stubPhase("first"), stubPhase("second")],
  });

  expect(registry.entryPhaseId).toBe("first");
});

test("ExtensionRunner creates phase registry with registered handlers", async () => {
  const extension = await loadExtensionFromFactory((rowan) => {
    rowan.registerPhase({
      id: "custom",
      name: "Custom",
      description: "Custom phase.",
      prompt: {
        sections: [
          { type: "instructions", lines: ["Custom prompt"] },
        ],
      },
      async run() {
        return { message: "custom done", route: "stop" };
      },
    });
  }, testRuntime, process.cwd(), "<test:custom>");

  const runner = new ExtensionRunner([extension]);
  const registry = runner.createPhaseRegistry({ entryPhaseId: "custom" });
  const { handler } = resolvePhaseEntry(registry, "custom");

  expect(handler?.buildPrompt?.({
    phase: "custom",
    systemPrompt: "system",
    messages: [],
    tools: [],
    skills: [],
  })).toBeDefined();
});

test("custom three-phase registry runs validation correctly", () => {
  const registry: PhaseRegistry = {
    entryPhaseId: "decide",
    phases: [stubPhase("decide"), stubPhase("act"), stubPhase("check")],
    phaseHandlers: new Map(),
  };

  expect(() => ensurePhaseRegistry(registry)).not.toThrow();
  expect(resolvePhaseEntry(registry, "decide").phase).toBeDefined();
  expect(resolvePhaseEntry(registry, "act").phase).toBeDefined();
  expect(resolvePhaseEntry(registry, "check").phase).toBeDefined();
  expect(() => resolvePhaseEntry(registry, "missing")).toThrow("not defined in the phase registry");
});
