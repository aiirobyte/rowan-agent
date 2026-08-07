import { expect, test } from "bun:test";
import type { StreamFn } from "@rowan-agent/models";
import { AgentRuntime, InMemoryStore, type AgentConfig } from "../../src/runtime";
import type { Phase, PhaseRegistry } from "../../src/harness/phases/types";

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
    const config = {
      identity: "phase-normalization-default-v1",
      model: { provider: "test", id: "model" },
      stream,
      definition: {
        name: "test",
        description: "Test Agent.",
        prompt: "Test",
      },
      resources: {
        tools: [],
        skills: [],
        phases,
      },
    } as unknown as AgentConfig;
    const agentId = await runtime.createAgent(config, {
      idempotencyKey: "phase-normalization-default-agent",
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
    const config = {
      identity: "phase-normalization-custom-v1",
      model: { provider: "test", id: "model" },
      stream,
      definition: {
        name: "test",
        description: "Test Agent.",
        prompt: "Test",
      },
      resources: {
        tools: [],
        skills: [],
        phases: {
          phases: new Map([[phase.name, phase]]),
          entryPhaseId: phase.name,
        },
      },
    } as unknown as AgentConfig;
    const agentId = await runtime.createAgent(config, {
      idempotencyKey: "phase-normalization-custom-agent",
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

test("default restores Scope Skills while a file Phase uses only its Bundle Skills", async () => {
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
    name: "bundle-skill",
    description: "Bundle Skill",
    filePath: "<bundle>",
    baseDir: "<bundle>",
    content: "Bundle guidance",
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
    const config = {
      identity: "phase-normalization-skill-scope-v1",
      model: { provider: "test", id: "model" },
      stream,
      definition: {
        name: "test",
        description: "Test Agent.",
        prompt: "Test",
      },
      resources: {
        tools: [],
        skills: [rootSkill],
        phases: {
          phases: new Map([[phase.name, phase]]),
          entryPhaseId: phase.name,
        },
      },
    } as unknown as AgentConfig;
    const agentId = await runtime.createAgent(config, {
      idempotencyKey: "phase-normalization-skill-scope-agent",
    });
    const run = await runtime.start(agentId, "hello", {
      idempotencyKey: "phase-normalization-skill-scope-run",
    });

    await expect(run.wait()).resolves.toMatchObject({ type: "input_required", phase: "default" });
    expect(observed).toEqual([["bundle-skill"]]);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain("root-skill");
    expect(requests[0]).not.toContain("bundle-skill");
  } finally {
    await runtime.close();
  }
});

test("Runtime rejects a Context Phase that collides with its built-in default", async () => {
  let modelCalls = 0;
  const stream: StreamFn = async function* () {
    modelCalls += 1;
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
    const config = {
      identity: "phase-normalization-collision-v1",
      model: { provider: "test", id: "model" },
      stream,
      definition: {
        name: "test",
        description: "Test Agent.",
        prompt: "Test",
      },
      resources: {
        tools: [],
        skills: [],
        phases: {
          phases: new Map([[phase.name, phase]]),
          entryPhaseId: null,
        },
      },
    } as unknown as AgentConfig;
    const agentId = await runtime.createAgent(config, {
      idempotencyKey: "phase-normalization-collision-agent",
    });
    const run = await runtime.start(agentId, "hello", {
      idempotencyKey: "phase-normalization-collision-run",
    });

    await expect(run.wait()).resolves.toMatchObject({
      type: "failed",
      failure: {
        code: "execution_failed",
        message: "Configured Phase collides with Rowan built-in Phase \"default\".",
      },
    });
    expect(modelCalls).toBe(0);
  } finally {
    await runtime.close();
  }
});
