import { expect, test } from "bun:test";
import {
  RuntimeBootstrapRegistry,
  RuntimeExtensionLifetime,
} from "../../src/runtime/extension-lifetime";
import { ResourceRegistry } from "../../src/runtime/resource-registry";
import { scopeToKey } from "../../src/extensions/host";
import type { LoadedExtension, ScopeRef } from "../../src/extensions";

const extension = (
  path: string,
  factory: LoadedExtension["factory"],
): LoadedExtension => ({ path, name: path, factory });

test("R1: api.<kind>.register with and without scope commits to per-Scope sources", async () => {
  const teamScope: ScopeRef = [{ kind: "team", id: "alpha" }];
  const projectScope: ScopeRef = [{ kind: "team", id: "alpha" }, { kind: "project", id: "beta" }];

  let capturedApi: any;
  const ext = extension("test-scoped-ext", async (api) => {
    capturedApi = api;
    // Register global tool (no scope)
    await api.tools.register({
      name: "global_tool",
      description: "Global Tool",
      parameters: { type: "object" },
      execute: async () => ({ content: [] }),
    });

    // Register team scoped tool
    await api.tools.register(
      {
        name: "team_tool",
        description: "Team Tool",
        parameters: { type: "object" },
        execute: async () => ({ content: [] }),
      },
      teamScope,
    );

    // Register project scoped tool
    await api.tools.register(
      {
        name: "project_tool",
        description: "Project Tool",
        parameters: { type: "object" },
        execute: async () => ({ content: [] }),
      },
      projectScope,
    );

    // Register global skill
    await api.skills.register({
      name: "global-skill",
      description: "Global Skill",
      filePath: "<inline>",
      baseDir: "<inline>",
      content: "Global skill content",
      disableModelInvocation: false,
    });

    // Register team skill
    await api.skills.register(
      {
        name: "team-skill",
        description: "Team Skill",
        filePath: "<inline>",
        baseDir: "<inline>",
        content: "Team skill content",
        disableModelInvocation: false,
      },
      teamScope,
    );
  });

  const lifetime = new RuntimeExtensionLifetime();
  const registry = new RuntimeBootstrapRegistry(lifetime);

  try {
    await registry.loadExtensions([ext]);

    const teamSourceId = `rowan.extensions:${scopeToKey(teamScope)}`;
    const projectSourceId = `rowan.extensions:${scopeToKey(projectScope)}`;

    expect(teamSourceId).toBe("rowan.extensions:team:alpha");
    expect(projectSourceId).toBe("rowan.extensions:team:alpha/project:beta");

    // Global view resolves global resources
    const globalView = registry.resolveView({
      agents: [],
      tools: ["rowan.extensions"],
      skills: ["rowan.extensions"],
      phases: [],
    });
    expect(globalView.tools.map((t) => t.name)).toEqual(["global_tool"]);
    expect(globalView.skills.map((s) => s.name)).toEqual(["global-skill"]);

    // Team view resolves team resources
    const teamView = registry.resolveView({
      agents: [],
      tools: [teamSourceId],
      skills: [teamSourceId],
      phases: [],
    });
    expect(teamView.tools.map((t) => t.name)).toEqual(["team_tool"]);
    expect(teamView.skills.map((s) => s.name)).toEqual(["team-skill"]);

    // Project view resolves project resources
    const projectView = registry.resolveView({
      agents: [],
      tools: [projectSourceId],
      skills: [],
      phases: [],
    });
    expect(projectView.tools.map((t) => t.name)).toEqual(["project_tool"]);

    // Unregister scoped tool removes it from that specific source
    await capturedApi.tools.unregister("team_tool", teamScope);
    const updatedTeamView = registry.resolveView({
      agents: [],
      tools: [teamSourceId],
      skills: [],
      phases: [],
    });
    expect(updatedTeamView.tools).toEqual([]);
    // Global tool still intact
    const stillGlobalView = registry.resolveView({
      agents: [],
      tools: ["rowan.extensions"],
      skills: [],
      phases: [],
    });
    expect(stillGlobalView.tools.map((t) => t.name)).toEqual(["global_tool"]);
  } finally {
    await lifetime.close();
  }
});

test("R2: rowan.extensions is NOT implicitly added to views; only rowan.core is implicit", async () => {
  const ext = extension("test-no-implicit", async (api) => {
    await api.tools.register({
      name: "ext_tool",
      description: "Ext Tool",
      parameters: { type: "object" },
      execute: async () => ({ content: [] }),
    });
  });

  const lifetime = new RuntimeExtensionLifetime();
  const registry = new RuntimeBootstrapRegistry(lifetime);

  try {
    await registry.ensureCoreResources();
    await registry.loadExtensions([ext]);

    // View with empty tools should only have rowan.core tools (route)
    const emptyToolsView = registry.resolveView({
      agents: [],
      tools: [],
      skills: [],
      phases: [],
    });

    expect(emptyToolsView.tools.map((t) => t.name)).toContain("route");
    expect(emptyToolsView.tools.some((t) => t.name === "ext_tool")).toBe(false);

    // Explicitly naming rowan.extensions resolves ext_tool
    const explicitView = registry.resolveView({
      agents: [],
      tools: ["rowan.extensions"],
      skills: [],
      phases: [],
    });
    expect(explicitView.tools.some((t) => t.name === "ext_tool")).toBe(true);
  } finally {
    await lifetime.close();
  }
});

test("R3: sourcesFor treats requested but never-registered source as empty instead of throwing", async () => {
  const registry = new ResourceRegistry();
  const resolved = registry.resolveView({
    agents: ["nonexistent.agents"],
    tools: ["nonexistent.tools"],
    skills: ["rowan.extensions:team:unregistered"],
    phases: ["rowan.extensions:nonexistent"],
  });

  expect(resolved.agents).toEqual([]);
  expect(resolved.tools).toEqual([]);
  expect(resolved.skills).toEqual([]);
  expect(resolved.phases).toEqual([]);
});
