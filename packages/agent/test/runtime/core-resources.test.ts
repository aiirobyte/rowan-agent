import { expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  COMPACT_PHASE_ID,
  DEFAULT_PHASE_ID,
  STOP_PHASE_ID,
  createCorePhases,
  loadPhase,
  loadSkill,
} from "../../src";
import type { StreamFn } from "@rowan-agent/models";
import { AgentRuntime, InMemoryStore } from "../../src/runtime";
import type { AgentDefinition } from "../../src/harness/definitions";
import { configuration, seedResources } from "../fixtures/configuration";
import type { Phase } from "../../src/harness/phases/types";
import { RuntimeBootstrapRegistry } from "../../src/runtime/extension-lifetime";

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
