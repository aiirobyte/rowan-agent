import { expect, test } from "bun:test";
import {
  createPhaseConfig,
  createDefaultPhaseConfig,
  definePhasePlugin,
  resolvePhase,
  validatePhaseConfig,
} from "../src/loop/phases";
import type { PhaseConfig, PhaseDefinition } from "../src/loop/phases";

function stubPhase(id: string): PhaseDefinition {
  return {
    id,
    name: id,
    description: `${id} phase`,
    run: async () => ({ message: "", route: "stop" }),
  };
}

test("validatePhaseConfig accepts a valid config", () => {
  const config: PhaseConfig = {
    entryPhaseId: "a",
    phases: [stubPhase("a"), stubPhase("b")],
  };

  expect(() => validatePhaseConfig(config)).not.toThrow();
});

test("validatePhaseConfig rejects empty entryPhaseId", () => {
  const config: PhaseConfig = {
    entryPhaseId: "",
    phases: [stubPhase("a")],
  };

  expect(() => validatePhaseConfig(config)).toThrow("non-empty entryPhaseId");
});

test("validatePhaseConfig rejects empty phases array", () => {
  const config: PhaseConfig = {
    entryPhaseId: "a",
    phases: [],
  };

  expect(() => validatePhaseConfig(config)).toThrow("at least one phase definition");
});

test("validatePhaseConfig rejects phase with empty id", () => {
  const config: PhaseConfig = {
    entryPhaseId: "a",
    phases: [{ id: "", name: "", description: "", run: async () => ({ message: "", route: "stop" }) }],
  };

  expect(() => validatePhaseConfig(config)).toThrow("non-empty id");
});

test("validatePhaseConfig rejects duplicate phase ids", () => {
  const config: PhaseConfig = {
    entryPhaseId: "a",
    phases: [stubPhase("a"), stubPhase("a")],
  };

  expect(() => validatePhaseConfig(config)).toThrow("Duplicate phase id: a");
});

test("validatePhaseConfig rejects entryPhaseId not in phases", () => {
  const config: PhaseConfig = {
    entryPhaseId: "missing",
    phases: [stubPhase("a")],
  };

  expect(() => validatePhaseConfig(config)).toThrow("not defined in phases");
});

test("resolvePhase returns matching phase definition", () => {
  const phase = stubPhase("target");
  const config: PhaseConfig = {
    entryPhaseId: "target",
    phases: [stubPhase("other"), phase],
  };

  expect(resolvePhase(config, "target")).toBe(phase);
});

test("resolvePhase returns undefined for unknown id", () => {
  const config: PhaseConfig = {
    entryPhaseId: "a",
    phases: [stubPhase("a")],
  };

  expect(resolvePhase(config, "missing")).toBeUndefined();
});

test("createDefaultPhaseConfig returns chat as the default phase id", () => {
  const config = createDefaultPhaseConfig();

  expect(config.entryPhaseId).toBe("chat");
  expect(config.phases.map((p) => p.id)).toEqual(["chat"]);
  expect(config.phases[0]).toMatchObject({
    name: "Chat",
    description: expect.any(String),
  });
});

test("createDefaultPhaseConfig passes validation", () => {
  const config = createDefaultPhaseConfig();

  expect(() => validatePhaseConfig(config)).not.toThrow();
});

test("createPhaseConfig composes phases from plugins", () => {
  const first = stubPhase("first");
  const second = stubPhase("second");

  const config = createPhaseConfig({
    plugins: [
      definePhasePlugin({
        id: "core",
        entryPhaseId: "first",
        phases: [first],
      }),
      definePhasePlugin({
        id: "extra",
        phases: [second],
      }),
    ],
  });

  expect(config.entryPhaseId).toBe("first");
  expect(config.phases).toEqual([first, second]);
  expect(resolvePhase(config, "second")).toBe(second);
});

test("createPhaseConfig lets explicit entryPhaseId override plugin entry", () => {
  const config = createPhaseConfig({
    entryPhaseId: "override",
    plugins: [
      definePhasePlugin({
        id: "core",
        entryPhaseId: "first",
        phases: [stubPhase("first"), stubPhase("override")],
      }),
    ],
  });

  expect(config.entryPhaseId).toBe("override");
});

test("createPhaseConfig rejects duplicate plugin ids", () => {
  expect(() =>
    createPhaseConfig({
      plugins: [
        definePhasePlugin({ id: "duplicate", phases: [stubPhase("a")] }),
        definePhasePlugin({ id: "duplicate", phases: [stubPhase("b")] }),
      ],
    }),
  ).toThrow("Duplicate phase plugin id: duplicate");
});

test("custom three-phase config runs validation correctly", () => {
  const config: PhaseConfig = {
    entryPhaseId: "decide",
    phases: [stubPhase("decide"), stubPhase("act"), stubPhase("check")],
  };

  expect(() => validatePhaseConfig(config)).not.toThrow();
  expect(resolvePhase(config, "decide")).toBeDefined();
  expect(resolvePhase(config, "act")).toBeDefined();
  expect(resolvePhase(config, "check")).toBeDefined();
  expect(resolvePhase(config, "missing")).toBeUndefined();
});