import { expect, test } from "bun:test";
import type { StreamFn } from "@rowan-agent/models";
import { AgentRuntime, InMemoryStore } from "../../src/runtime";
import type { Phase, PhaseRegistry } from "../../src/harness/phases/types";
import { createAgentWith } from "../fixtures/configuration";

/** An Agent whose Phases are registered the Host way, with core in the view. */
function phaseAgent(
  runtime: AgentRuntime,
  input: Readonly<{
    identity: string;
    stream: StreamFn;
    phases?: Map<string, Phase> | Readonly<{ phases: Map<string, Phase>; entryPhaseId: string | null }>;
    skills?: readonly Parameters<typeof createAgentWith>[1]["skills"] extends readonly (infer Skill)[] | undefined ? Skill : never;
    entryPhaseId?: string | null;
    options?: Readonly<{ idempotencyKey?: string }>;
  }>,
) {
  const registry = input.phases;
  const map = registry instanceof Map ? registry : registry?.phases;
  const values = map ? [...map.values()] : [];
  const entry = input.entryPhaseId ?? (registry instanceof Map ? null : registry?.entryPhaseId ?? null);
  return createAgentWith(runtime, {
    identity: input.identity,
    stream: input.stream,
    core: true,
    ...(map ? { phases: values } : {}),
    ...(input.skills ? { skills: input.skills } : {}),
    ...(map ? {
      definition: {
        phases: { entryPhaseId: entry, phaseIds: values.map(({ name }) => name) },
      },
    } : {}),
    ...(input.options === undefined ? {} : { options: input.options }),
  });
}

const customPhase: Phase = {
  name: "custom",
  description: "Custom phase",
  filePath: "<test>",
  baseDir: "<test>",
  content: "Custom",
  isolated: false,
};

test("Runtime falls back to its built-in default when a custom Phase registry has no entry", async () => {
  let modelCalls = 0;
  const stream: StreamFn = async function* () {
    modelCalls += 1;
    yield {
      type: "start",
      partial: { role: "assistant", contentBlocks: [] },
    };
    yield {
      type: "text_delta",
      text: "done",
      partial: {
        role: "assistant",
        contentBlocks: [{ type: "text", text: "done" }],
      },
    };
    yield {
      type: "done",
      response: { content: "done", stopReason: "stop" },
    };
  };
  const phases: PhaseRegistry = {
    phases: new Map([[customPhase.name, customPhase]]),
    entryPhaseId: null,
  };
  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
  });
  try {
    const agentId = await phaseAgent(runtime, {
      identity: "phase-normalization-default-v1",
      stream,
      phases,
      options: { idempotencyKey: "phase-normalization-default-agent" },
    });
    const run = await runtime.start(agentId, "hello", {
      idempotencyKey: "phase-normalization-default-run",
    });

    await expect(run.wait()).resolves.toMatchObject({
      type: "input_required",
      phase: "default",
    });
    expect(modelCalls).toBe(1);
  } finally {
    await runtime.close();
  }
});

test("Runtime preserves an explicit custom Phase entry", async () => {
  let phaseCalls = 0;
  let modelCalls = 0;
  const stream: StreamFn = async function* () {
    modelCalls += 1;
    yield { type: "done" };
  };
  const phase: Phase = {
    ...customPhase,
    run: async () => {
      phaseCalls += 1;
      return { message: "custom complete", route: "stop" };
    },
  };
  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
  });
  try {
    const agentId = await phaseAgent(runtime, {
      identity: "phase-normalization-custom-v1",
      stream,
      phases: new Map([[phase.name, phase]]),
      entryPhaseId: phase.name,
      options: { idempotencyKey: "phase-normalization-custom-agent" },
    });
    const run = await runtime.start(agentId, "hello", {
      idempotencyKey: "phase-normalization-custom-run",
    });

    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(phaseCalls).toBe(1);
    expect(modelCalls).toBe(0);
  } finally {
    await runtime.close();
  }
});

test("default keeps root Skills while a file Phase adds its Bundle Skills", async () => {
  const requests: string[] = [];
  const stream: StreamFn = async function* (request) {
    requests.push(request.system ?? "");
    yield {
      type: "start",
      partial: { role: "assistant", contentBlocks: [] },
    };
    yield {
      type: "text_delta",
      text: "done",
      partial: {
        role: "assistant",
        contentBlocks: [{ type: "text", text: "done" }],
      },
    };
    yield {
      type: "done",
      response: { content: "done", stopReason: "stop" },
    };
  };
  const rootSkill = {
    name: "root-skill",
    description: "Root Skill",
    filePath: "<root>",
    baseDir: "<root>",
    content: "Root guidance",
    disableModelInvocation: false,
  };
  const bundleSkill = {
    name: "root-skill",
    description: "Phase replacement Skill",
    filePath: "<bundle>",
    baseDir: "<bundle>",
    content: "Phase replacement guidance",
    disableModelInvocation: false,
  };
  const observed: string[][] = [];
  const phase: Phase = {
    ...customPhase,
    run: async (context) => {
      observed.push(context.skills.map(({ name }) => name));
      return { message: "enter default", route: "default" };
    },
    skills: [bundleSkill],
  };
  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
  });
  try {
    const agentId = await phaseAgent(runtime, {
      identity: "phase-normalization-skill-scope-v1",
      stream,
      skills: [rootSkill],
      phases: new Map([[phase.name, phase]]),
      entryPhaseId: phase.name,
      options: { idempotencyKey: "phase-normalization-skill-scope-agent" },
    });
    const run = await runtime.start(agentId, "hello", {
      idempotencyKey: "phase-normalization-skill-scope-run",
    });

    await expect(run.wait()).resolves.toMatchObject({ type: "input_required", phase: "default" });
    expect(observed).toEqual([["root-skill"]]);
    expect(requests[0]).not.toContain("Phase replacement guidance");
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain("root-skill");
    expect(requests[0]).not.toContain("bundle-skill");
  } finally {
    await runtime.close();
  }
});

test("parallel file Phases add their Bundle Skills to root Skills", async () => {
  const rootSkill = {
    name: "root-skill",
    description: "Root Skill",
    filePath: "<root>",
    baseDir: "<root>",
    content: "Root guidance",
    disableModelInvocation: false,
  };
  const observed: Record<string, string[]> = {};
  const observedDescriptions: Record<string, string[]> = {};
  const bundled = (name: string) => ({
    name,
    description: `${name} Skill`,
    filePath: `<${name}>`,
    baseDir: `<${name}>`,
    content: `${name} guidance`,
    disableModelInvocation: false,
  });
  const phases: PhaseRegistry = {
    phases: new Map<string, Phase>([
      ["entry", {
        name: "entry",
        description: "Dispatch",
        filePath: "<entry>",
        baseDir: "<entry>",
        content: "Dispatch",
        isolated: false,
        target: "stop",
        run: async () => ({
          message: "dispatch",
          route: "left",
          toolCalls: [{
            id: "route-parallel",
            name: "route",
            args: { decision: [{ phase: "left" }, { phase: "right" }] },
          }],
        }),
      }],
      ["left", {
        name: "left",
        description: "Left",
        filePath: "<left>",
        baseDir: "<left>",
        content: "Left",
        isolated: false,
        skills: [bundled("root-skill")],
        run: async (context) => {
          observed.left = context.skills.map(({ name }) => name);
          observedDescriptions.left = context.skills.map(({ description }) => description);
          return { message: "left", route: "stop" };
        },
      }],
      ["right", {
        name: "right",
        description: "Right",
        filePath: "<right>",
        baseDir: "<right>",
        content: "Right",
        isolated: false,
        skills: [bundled("right-skill")],
        run: async (context) => {
          observed.right = context.skills.map(({ name }) => name);
          observedDescriptions.right = context.skills.map(({ description }) => description);
          return { message: "right", route: "stop" };
        },
      }],
    ]),
    entryPhaseId: "entry",
  };
  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
  });
  try {
    const agentId = await phaseAgent(runtime, {
      identity: "phase-normalization-parallel-skills-v1",
      stream: async function* () { yield { type: "done" }; },
      skills: [rootSkill],
      phases,
      options: { idempotencyKey: "phase-normalization-parallel-skills-agent" },
    });
    const run = await runtime.start(agentId, "hello", {
      idempotencyKey: "phase-normalization-parallel-skills-run",
    });

    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(observed).toEqual({
      left: ["root-skill"],
      right: ["root-skill", "right-skill"],
    });
    expect(observedDescriptions.left).toEqual(["root-skill Skill"]);
  } finally {
    await runtime.close();
  }
});

test("Runtime rejects a Context Phase that collides with its built-in default", async () => {
  const stream: StreamFn = async function* () {
    yield { type: "done" };
  };
  const phase: Phase = {
    ...customPhase,
    name: "default",
  };
  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
  });
  try {
    // The registry refuses the reserved name at registration, before a Run exists.
    await expect(phaseAgent(runtime, {
      identity: "phase-normalization-collision-v1",
      stream,
      phases: new Map([[phase.name, phase]]),
      entryPhaseId: null,
      options: { idempotencyKey: "phase-normalization-collision-agent" },
    })).rejects.toThrow(/reserved by Rowan core/);
  } finally {
    await runtime.close();
  }
});
