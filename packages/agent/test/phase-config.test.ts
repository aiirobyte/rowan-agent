import { expect, test } from "bun:test";
import {
  builtinPhaseConfigTemplate,
  createAgentPhaseConfig,
  createDefaultAgentPhaseConfig,
  createPhaseConfigFromTemplate,
  definePhasePlugin,
  resolvePhase,
  validatePhaseConfig,
} from "../src/loop/phases";
import type { AgentPhaseConfig, PhaseDefinition } from "../src/loop/phases";

function stubPhase(id: string): PhaseDefinition {
  return {
    id,
    name: id,
    description: `${id} phase`,
    buildInput: () => undefined,
  };
}

test("validatePhaseConfig accepts a valid config", () => {
  const config: AgentPhaseConfig = {
    entryPhaseId: "a",
    phases: [stubPhase("a"), stubPhase("b")],
  };

  expect(() => validatePhaseConfig(config)).not.toThrow();
});

test("validatePhaseConfig rejects empty entryPhaseId", () => {
  const config: AgentPhaseConfig = {
    entryPhaseId: "",
    phases: [stubPhase("a")],
  };

  expect(() => validatePhaseConfig(config)).toThrow("non-empty entryPhaseId");
});

test("validatePhaseConfig rejects empty phases array", () => {
  const config: AgentPhaseConfig = {
    entryPhaseId: "a",
    phases: [],
  };

  expect(() => validatePhaseConfig(config)).toThrow("at least one phase definition");
});

test("validatePhaseConfig rejects phase with empty id", () => {
  const config: AgentPhaseConfig = {
    entryPhaseId: "a",
    phases: [{ id: "", name: "", description: "", buildInput: () => undefined }],
  };

  expect(() => validatePhaseConfig(config)).toThrow("non-empty id");
});

test("validatePhaseConfig rejects duplicate phase ids", () => {
  const config: AgentPhaseConfig = {
    entryPhaseId: "a",
    phases: [stubPhase("a"), stubPhase("a")],
  };

  expect(() => validatePhaseConfig(config)).toThrow("Duplicate phase id: a");
});

test("validatePhaseConfig rejects entryPhaseId not in phases", () => {
  const config: AgentPhaseConfig = {
    entryPhaseId: "missing",
    phases: [stubPhase("a")],
  };

  expect(() => validatePhaseConfig(config)).toThrow("not defined in phases");
});

test("resolvePhase returns matching phase definition", () => {
  const phase = stubPhase("target");
  const config: AgentPhaseConfig = {
    entryPhaseId: "target",
    phases: [stubPhase("other"), phase],
  };

  expect(resolvePhase(config, "target")).toBe(phase);
});

test("resolvePhase returns undefined for unknown id", () => {
  const config: AgentPhaseConfig = {
    entryPhaseId: "a",
    phases: [stubPhase("a")],
  };

  expect(resolvePhase(config, "missing")).toBeUndefined();
});

test("createDefaultAgentPhaseConfig returns chat as the default phase id", () => {
  const config = createDefaultAgentPhaseConfig();

  expect(config.entryPhaseId).toBe("chat");
  expect(config.phases.map((p) => p.id)).toEqual(["chat"]);
  expect(config.phases[0]).toMatchObject({
    name: "Chat",
    description: expect.any(String),
  });
});

test("createDefaultAgentPhaseConfig passes validation", () => {
  const config = createDefaultAgentPhaseConfig();

  expect(() => validatePhaseConfig(config)).not.toThrow();
});

test("createAgentPhaseConfig composes phases from plugins", () => {
  const first = stubPhase("first");
  const second = stubPhase("second");

  const config = createAgentPhaseConfig({
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

test("createAgentPhaseConfig lets explicit entryPhaseId override plugin entry", () => {
  const config = createAgentPhaseConfig({
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

test("createAgentPhaseConfig rejects duplicate plugin ids", () => {
  expect(() =>
    createAgentPhaseConfig({
      plugins: [
        definePhasePlugin({ id: "duplicate", phases: [stubPhase("a")] }),
        definePhasePlugin({ id: "duplicate", phases: [stubPhase("b")] }),
      ],
    }),
  ).toThrow("Duplicate phase plugin id: duplicate");
});

test("builtin phase config is created from a persistent template", () => {
  const config = createPhaseConfigFromTemplate(builtinPhaseConfigTemplate);

  expect(builtinPhaseConfigTemplate.entryPhaseId).toBe("chat");
  expect(builtinPhaseConfigTemplate.phases.map((phase) => phase.id)).toEqual([
    "chat",
    "plan",
    "execute",
    "verify",
  ]);
  expect(config.entryPhaseId).toBe("chat");
  expect(config.phases.map((phase) => phase.id)).toEqual([
    "chat",
    "plan",
    "execute",
    "verify",
  ]);
});

test("custom three-phase config runs validation correctly", () => {
  const config: AgentPhaseConfig = {
    entryPhaseId: "decide",
    phases: [stubPhase("decide"), stubPhase("act"), stubPhase("check")],
  };

  expect(() => validatePhaseConfig(config)).not.toThrow();
  expect(resolvePhase(config, "decide")).toBeDefined();
  expect(resolvePhase(config, "act")).toBeDefined();
  expect(resolvePhase(config, "check")).toBeDefined();
  expect(resolvePhase(config, "missing")).toBeUndefined();
});
