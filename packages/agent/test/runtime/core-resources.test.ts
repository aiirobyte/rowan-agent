import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  COMPACT_PHASE_ID,
  DEFAULT_PHASE_ID,
  STOP_PHASE_ID,
  createCorePhases,
  loadPhase,
  loadPhases,
  loadSkill,
} from "../../src";
import type { StreamFn } from "@rowan-agent/models";
import { AgentRuntime, InMemoryStore } from "../../src/runtime";
import type { AgentDefinition } from "../../src/harness/definitions";
import { configuration, createAgentWith, seedResources } from "../fixtures/configuration";
import type { Phase } from "../../src/harness/phases/types";
import { RuntimeBootstrapRegistry } from "../../src/runtime/extension-lifetime";
import { stopResponse } from "./route-test-utils";

test("Rowan Core Phases are immutable and expose the invocation policy matrix", () => {
  const phases = createCorePhases();
  expect(phases.map(({ name }) => name)).toEqual([
    DEFAULT_PHASE_ID,
    STOP_PHASE_ID,
    COMPACT_PHASE_ID,
  ]);
  expect(phases.map(({ disableAutoInvocation, disableImplicitInvocation }) => ({
    disableAutoInvocation,
    disableImplicitInvocation,
  }))).toEqual([
    { disableAutoInvocation: false, disableImplicitInvocation: true },
    { disableAutoInvocation: false, disableImplicitInvocation: false },
    { disableAutoInvocation: true, disableImplicitInvocation: false },
  ]);
  expect(phases.every(({ core }) => core === true)).toBe(true);
});

test("Core Phase source is present even when a Resource View selects no authored Phases", async () => {
  const registry = new RuntimeBootstrapRegistry();
  await registry.ensureCoreResources();
  const view = registry.resolveView({ agents: [], tools: [], skills: [], phases: [] });
  expect(view.phases.map(({ name }) => name)).toEqual([
    DEFAULT_PHASE_ID,
    STOP_PHASE_ID,
    COMPACT_PHASE_ID,
  ]);
});

test("Phase and Skill loaders default and parse independent invocation policies", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-core-resources-"));
  const phaseDir = join(root, "review");
  const skillDir = join(root, "skill");
  await mkdir(phaseDir, { recursive: true });
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(phaseDir, "PHASE.md"), `---
name: review
description: Review
disable-auto-invocation: true
disable-implicit-invocation: false
---
Review work.
`);
  await writeFile(join(skillDir, "SKILL.md"), `---
name: skill
description: Skill
disable-auto-invocation: true
disable-implicit-invocation: true
---
Skill guidance.
`);

  const phase = await loadPhase(phaseDir);
  const skill = await loadSkill(skillDir);
  expect(phase.disableAutoInvocation).toBe(true);
  expect(phase.disableImplicitInvocation).toBe(false);
  expect(skill.disableAutoInvocation).toBe(true);
  expect(skill.disableImplicitInvocation).toBe(true);
});

test("PHASE.md frontmatter cannot declare a Core Phase", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-core-frontmatter-"));
  try {
    const phaseDir = join(root, "host-phase");
    await mkdir(phaseDir, { recursive: true });
    await writeFile(join(phaseDir, "PHASE.md"), `---
name: host-phase
description: Host phase
core: true
---
Host work.
`);

    const phases = await loadPhases(root);
    expect(phases.phases.get("host-phase")?.core).toBeUndefined();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("host Core resources survive Phase-local filters and enter the automatic route catalog", async () => {
  let phaseToolNames: string[] = [];
  let routeDescription = "";
  const work: Phase = {
    name: "work",
    description: "Work",
    content: "Work",
    filePath: "<work>",
    baseDir: "<work>",
    tools: [],
    run: async (context) => {
      phaseToolNames = context.tools.map(({ name }) => name);
      routeDescription = context.tools.find(({ name }) => name === "route")?.description ?? "";
      return { message: "Work complete.", route: "stop" };
    },
  };
  const stream: StreamFn = async function* () {
    yield { type: "done", response: stopResponse("Done.") };
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await createAgentWith(runtime, {
      identity: "host-core-phase-local-filter-v1",
      definition: {
        name: "core-phase-local-filter",
        description: "Core phase local filtering",
        prompt: "Run work.",
        tools: [],
        phases: { entryPhaseId: "work", phaseIds: ["work"] },
      },
      tools: [{
        name: "host_core_tool",
        core: true,
        description: "Host core tool",
        parameters: { type: "object", properties: {} },
        execute: async () => ({ ok: true as const, content: null }),
      }],
      phases: [
        work,
        {
          name: "host_auto_phase",
          core: true,
          description: "Automatically routable host core phase",
          content: "Automatic.",
          filePath: "<auto>",
          baseDir: "<auto>",
        },
        {
          name: "host_manual_phase",
          core: true,
          description: "Non-automatic host core phase",
          content: "Manual.",
          disableAutoInvocation: true,
          filePath: "<manual>",
          baseDir: "<manual>",
        },
      ],
      stream,
      options: { idempotencyKey: "host-core-phase-local-filter-agent" },
    });

    const run = await runtime.start(agentId, "Run.", {
      idempotencyKey: "host-core-phase-local-filter-run",
    });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });

    expect(phaseToolNames).toContain("host_core_tool");
    expect(routeDescription).toContain("host_auto_phase");
    expect(routeDescription).not.toContain("host_manual_phase");
  } finally {
    await runtime.close();
  }
});

test("Runtime invocation catalog applies policy after authored selection and keeps Core Phases", async () => {
  const stream: StreamFn = async function* () { yield { type: "done" }; };
  const authored: Phase = {
    name: "review",
    description: "Review",
    filePath: "<review>",
    baseDir: "<review>",
    content: "Review",
    disableAutoInvocation: true,
    disableImplicitInvocation: false,
  };
  const skill = {
    name: "private",
    description: "Private",
    filePath: "<private>",
    baseDir: "<private>",
    content: "Private",
    disableAutoInvocation: false,
    disableImplicitInvocation: true,
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const definition: AgentDefinition = {
      name: "test",
      description: "Test",
      prompt: "Test",
      phases: { entryPhaseId: null, phaseIds: ["review"] },
    };
    const view = await seedResources(runtime, {
      agents: [definition],
      skills: [skill],
      phases: [authored],
    });
    const agentId = await runtime.createAgent(configuration({
      identity: "core-invocation-catalog-v1",
      definition: definition.name,
      view,
      model: { provider: "test", id: "model" },
      stream,
    }), { idempotencyKey: "core-invocation-catalog-agent" });
    const implicit = await runtime.listInvocations(agentId, { source: "implicit" });
    expect(implicit.filter((entry) => entry.kind === "phase").map(({ name }) => name)).toEqual(["stop", "compact", "review"]);
    expect(implicit.some((entry) => entry.name === "private")).toBe(false);
    const automatic = await runtime.listInvocations(agentId, { source: "auto" });
    expect(automatic.some((entry) => entry.name === "review")).toBe(false);
    expect(automatic.some((entry) => entry.name === "compact")).toBe(false);
    expect(automatic.some((entry) => entry.name === "private")).toBe(true);
  } finally {
    await runtime.close();
  }
});
