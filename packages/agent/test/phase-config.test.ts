import { expect, test } from "bun:test";
import {
  createDefaultAgentPhaseConfig,
  resolvePhase,
  validatePhaseConfig,
} from "../src/loop/phase-config";
import type { AgentPhaseConfig, AgentPhaseDefinition } from "../src/loop/phase-config";

function stubPhase(id: string): AgentPhaseDefinition {
  return {
    id,
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
    phases: [{ id: "", buildInput: () => undefined }],
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

test("createDefaultAgentPhaseConfig returns config with built-in phase ids", () => {
  const config = createDefaultAgentPhaseConfig();

  expect(config.entryPhaseId).toBe("route");
  expect(config.phases.map((p) => p.id)).toEqual(["route", "thread", "plan", "execute", "verify"]);
});

test("createDefaultAgentPhaseConfig passes validation", () => {
  const config = createDefaultAgentPhaseConfig();

  expect(() => validatePhaseConfig(config)).not.toThrow();
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
