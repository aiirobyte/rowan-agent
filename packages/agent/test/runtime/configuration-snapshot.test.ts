import { expect, spyOn, test } from "bun:test";
import Type from "typebox";
import {
  ResourceRegistry,
  type ResourceView,
} from "../../src/runtime/resource-registry";
import {
  resolveConfigurationSnapshot,
  type AgentConfiguration,
} from "../../src/runtime/configuration-snapshot";

const view: ResourceView = {
  agents: ["definitions"],
  tools: ["project-tools"],
  skills: ["project-skills"],
  phases: ["project-phases"],
};

const tool = (name: string) => ({
  name,
  description: name,
  parameters: Type.Object({}),
  execute: async () => ({ ok: true as const, content: null }),
});

test("snapshot resolution applies Definition, Layer, and Phase narrowing monotonically", async () => {
  const warnings = spyOn(console, "warn").mockImplementation(() => undefined);
  try {
    const registry = new ResourceRegistry();
    await registry.loadAgents({
      sourceId: "definitions",
      values: [{
        name: "base",
        description: "Base",
        prompt: "Base body.",
        tools: ["keep", "drop"],
        skills: ["review", "drop-skill"],
        phases: { entryPhaseId: "review", phaseIds: ["review", "build"] },
        contexts: ["project"],
      }],
    });
    await registry.loadTools({ sourceId: "project-tools", values: [tool("keep"), tool("drop"), tool("phase-only")] });
    await registry.loadSkills({
      sourceId: "project-skills",
      values: [
        { name: "review", description: "Review", filePath: "<test>", baseDir: "<test>", content: "Review", disableModelInvocation: false },
        { name: "drop-skill", description: "Drop", filePath: "<test>", baseDir: "<test>", content: "Drop", disableModelInvocation: false },
      ],
    });
    await registry.loadPhases({
      sourceId: "project-phases",
      values: [
        { name: "review", description: "Review", content: "Review", filePath: "<test>", baseDir: "<test>", tools: ["keep"] },
        { name: "build", description: "Build", content: "Build", filePath: "<test>", baseDir: "<test>", tools: ["phase-only"] },
      ],
    });

    const input: AgentConfiguration = {
      identity: "snapshot-v1",
      definition: {
        name: "base",
        layer: {
          prompt: "Workflow body.",
          tools: ["keep", "phase-only"],
          skills: ["review"],
          phases: { entryPhaseId: "review", phaseIds: ["review"] },
        },
      },
      resourceView: view,
      contexts: [
        { name: "project", value: { id: "p1" } },
        { name: "unused", value: { secret: "no" } },
      ],
      model: { provider: "test", id: "model" },
    };

    const snapshot = resolveConfigurationSnapshot(registry, input);

    expect(snapshot.definition.prompt).toBe("Workflow body.");
    expect(snapshot.resources.tools.map(({ name }) => name)).toEqual(["keep"]);
    expect(snapshot.resources.skills.map(({ name }) => name)).toEqual(["review"]);
    expect([...snapshot.resources.phases!.phases.values()].map(({ name }) => name)).toEqual(["review"]);
    expect(snapshot.resources.phases!.entryPhaseId).toBe("review");
    expect(snapshot.contexts).toEqual([{ name: "project", value: { id: "p1" } }]);
    expect(snapshot.resources.refs.tool).toEqual([{ kind: "tool", sourceId: "project-tools", name: "keep" }]);
  } finally {
    warnings.mockRestore();
  }
});

test("a Definition Layer cannot widen a parent selection", async () => {
  const warnings = spyOn(console, "warn").mockImplementation(() => undefined);
  try {
    const registry = new ResourceRegistry();
    await registry.loadAgents({ sourceId: "definitions", values: [{
      name: "base", description: "Base", prompt: "Base", tools: ["keep"], skills: [],
    }] });
    await registry.loadTools({ sourceId: "project-tools", values: [tool("keep"), tool("hidden")] });
    const snapshot = resolveConfigurationSnapshot(registry, {
      identity: "narrow-v1",
      definition: { name: "base", layer: { tools: ["hidden"] } },
      resourceView: { ...view, skills: [], phases: [] },
      model: { provider: "test", id: "model" },
    });
    expect(snapshot.resources.tools).toEqual([]);
    expect(warnings.mock.calls.some(([message]) => String(message).includes('Tool "hidden"'))).toBe(true);
  } finally {
    warnings.mockRestore();
  }
});

test("the built-in default entry is valid with an empty authored Phase selection", async () => {
  const warnings = spyOn(console, "warn").mockImplementation(() => undefined);
  try {
    const registry = new ResourceRegistry();
    await registry.loadAgents({ sourceId: "definitions", values: [{
      name: "base",
      description: "Base",
      prompt: "Base",
      phases: { entryPhaseId: "default", phaseIds: [] },
    }] });
    await registry.loadTools({ sourceId: "project-tools", values: [] });
    await registry.loadSkills({ sourceId: "project-skills", values: [] });
    await registry.loadPhases({ sourceId: "project-phases", values: [] });

    const snapshot = resolveConfigurationSnapshot(registry, {
      identity: "default-entry-v1",
      definition: { name: "base" },
      resourceView: view,
      model: { provider: "test", id: "model" },
    });

    expect(snapshot.resources.phases).toEqual({ phases: new Map(), entryPhaseId: "default" });
    expect(warnings).not.toHaveBeenCalled();
  } finally {
    warnings.mockRestore();
  }
});
