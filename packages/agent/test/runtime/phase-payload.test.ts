import { expect, test } from "bun:test";
import type { StreamFn } from "@rowan-agent/models";
import { AgentRuntime, InMemoryStore } from "../../src/runtime";
import type { Phase } from "../../src/harness/phases/types";
import { createPhaseAgent } from "../fixtures/configuration";
import { routeResponse, stopResponse } from "./route-test-utils";

function agentWithPhase(
  runtime: AgentRuntime,
  stream: StreamFn,
  phases: { phases: Map<string, Phase>; entryPhaseId: string },
  options: { idempotencyKey?: string } = {},
) {
  return createPhaseAgent(runtime, { identity: "phase-payload-v1", stream, phases, options });
}

test("direct run Phases receive their effective input defaults", async () => {
  let observed: unknown;
  const phase: Phase = {
    name: "configure",
    description: "Configure",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Configure.",
    input: { provider: "codex", options: { includeTests: true } },
    run: async (context) => {
      observed = context.state.payload;
      return { message: "configured", route: "stop" };
    },
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await agentWithPhase(
      runtime,
      async function* () { yield { type: "done", response: stopResponse() }; },
      {
        phases: new Map([[phase.name, phase]]),
        entryPhaseId: phase.name,
      },
      { idempotencyKey: "phase-payload-direct-agent" },
    );
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "phase-payload-direct-run" });

    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(observed).toEqual({ provider: "codex", options: { includeTests: true } });
  } finally {
    await runtime.close();
  }
});

test("direct run Phases merge the host-provided initial payload", async () => {
  let observed: unknown;
  const phase: Phase = {
    name: "configure-host",
    description: "Configure from host",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Configure from host.",
    input: { provider: "codex", options: { includeTests: true } },
    run: async (context) => {
      observed = context.state.payload;
      return { message: "configured", route: "stop" };
    },
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await agentWithPhase(
      runtime,
      async function* () { yield { type: "done", response: stopResponse() }; }, {
        phases: new Map([[phase.name, phase]]),
        entryPhaseId: phase.name,
      },
      { idempotencyKey: "phase-payload-host-agent" },
    );
    const run = await runtime.start(agentId, "hello", {
      idempotencyKey: "phase-payload-host-run",
      metadata: { phasePayload: { provider: "anthropic" } },
    });

    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(observed).toEqual({ provider: "anthropic", options: { includeTests: true } });
  } finally {
    await runtime.close();
  }
});

test("Extension Phases read the same effective payload through the generic API", async () => {
  let observed: unknown;
  const phase: Phase = {
    name: "extension",
    description: "Extension",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Extension.",
    input: { provider: "codex", options: { includeTests: true } },
    factory: async (api) => {
      observed = api.phase.getPayload();
      api.phase.setMessage("extended");
      api.phase.setNextPhase("stop");
    },
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await agentWithPhase(
      runtime,
      async function* () { yield { type: "done" }; }, {
        phases: new Map([[phase.name, phase]]),
        entryPhaseId: phase.name,
      },
      { idempotencyKey: "phase-payload-extension-agent" },
    );
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "phase-payload-extension-run" });

    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(observed).toEqual({ provider: "codex", options: { includeTests: true } });
  } finally {
    await runtime.close();
  }
});

test("a serial Model route prepares the target payload before transition", async () => {
  let modelCalls = 0;
  let targetPayload: unknown;
  const source: Phase = {
    name: "source",
    description: "Source",
    filePath: "<source>",
    baseDir: "<source>",
    content: "Source.",
  };
  const target: Phase = {
    name: "target",
    description: "Target",
    filePath: "<target>",
    baseDir: "<target>",
    content: "Target.",
    input: { provider: "codex", options: { includeTests: true } },
    run: async (context) => {
      targetPayload = context.state.payload;
      return { message: "targeted", route: "stop" };
    },
  };
  const stream: StreamFn = async function* () {
    modelCalls += 1;
    yield {
      type: "done",
      response: modelCalls === 1
        ? routeResponse([{ phase: "target", payload: { provider: "anthropic" } }])
        : stopResponse(),
    };
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await agentWithPhase(
      runtime,
      stream, {
        phases: new Map([[source.name, source], [target.name, target]]),
        entryPhaseId: source.name,
      },
      { idempotencyKey: "phase-payload-serial-agent" },
    );
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "phase-payload-serial-run" });

    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(targetPayload).toEqual({ provider: "anthropic", options: { includeTests: true } });
  } finally {
    await runtime.close();
  }
});

test("a Model Phase receives one prepared payload context message", async () => {
  let modelCalls = 0;
  let targetRequest: { messages: Array<{ content: unknown }> } | undefined;
  const source: Phase = {
    name: "source",
    description: "Source",
    filePath: "<source>",
    baseDir: "<source>",
    content: "Source.",
  };
  const target: Phase = {
    name: "target",
    description: "Target",
    filePath: "<target>",
    baseDir: "<target>",
    content: "Target.",
    input: { provider: "codex", options: { includeTests: true } },
  };
  const stream: StreamFn = async function* (request) {
    modelCalls += 1;
    if (modelCalls === 2) targetRequest = request;
    yield {
      type: "done",
      response: modelCalls === 1
        ? routeResponse([{ phase: "target", payload: { provider: "anthropic" } }])
        : stopResponse("finished"),
    };
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await agentWithPhase(
      runtime,
      stream, {
        phases: new Map([[source.name, source], [target.name, target]]),
        entryPhaseId: source.name,
      },
      { idempotencyKey: "phase-payload-model-agent" },
    );
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "phase-payload-model-run" });

    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    const content = (targetRequest?.messages ?? [])
      .map((message) => typeof message.content === "string" ? message.content : JSON.stringify(message.content))
      .join("\n");
    expect((content.match(/<phase_input>/g) ?? [])).toHaveLength(1);
    expect(content).toContain("anthropic");
    expect(content).toContain("includeTests");
  } finally {
    await runtime.close();
  }
});

test("an invalid Model payload does not enter the target Phase", async () => {
  let modelCalls = 0;
  let targetEntered = false;
  const source: Phase = {
    name: "source",
    description: "Source",
    filePath: "<source>",
    baseDir: "<source>",
    content: "Source.",
  };
  const target: Phase = {
    name: "target",
    description: "Target",
    filePath: "<target>",
    baseDir: "<target>",
    content: "Target.",
    input: { timeout: 15 },
    run: async () => {
      targetEntered = true;
      return { message: "unexpected", route: "stop" };
    },
  };
  const stream: StreamFn = async function* () {
    modelCalls += 1;
    yield {
      type: "done",
      response: routeResponse([{ phase: "target", payload: { timeout: "fast" } }]),
    };
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await agentWithPhase(
      runtime,
      stream, {
        phases: new Map([[source.name, source], [target.name, target]]),
        entryPhaseId: source.name,
      },
      { idempotencyKey: "phase-payload-invalid-agent" },
    );
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "phase-payload-invalid-run" });

    await expect(run.wait()).resolves.toMatchObject({ type: "input_required", phase: "source" });
    expect(targetEntered).toBe(false);
    expect(modelCalls).toBe(1);
  } finally {
    await runtime.close();
  }
});

test("a new serial route uses target defaults instead of inheriting payload", async () => {
  let targetPayload: unknown;
  const source: Phase = {
    name: "source",
    description: "Source",
    filePath: "<source>",
    baseDir: "<source>",
    content: "Source.",
    input: { value: "source-default" },
    run: async () => ({ message: "route", route: "target" }),
  };
  const target: Phase = {
    name: "target",
    description: "Target",
    filePath: "<target>",
    baseDir: "<target>",
    content: "Target.",
    input: { value: "target-default" },
    run: async (context) => {
      targetPayload = context.state.payload;
      return { message: "done", route: "stop" };
    },
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await agentWithPhase(
      runtime,
      async function* () { yield { type: "done" }; }, {
        phases: new Map([[source.name, source], [target.name, target]]),
        entryPhaseId: source.name,
      },
      { idempotencyKey: "phase-payload-fresh-agent" },
    );
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "phase-payload-fresh-run" });

    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(targetPayload).toEqual({ value: "target-default" });
  } finally {
    await runtime.close();
  }
});

test("continue retains the current invocation payload", async () => {
  const observed: unknown[] = [];
  const phase: Phase = {
    name: "loop",
    description: "Loop",
    filePath: "<loop>",
    baseDir: "<loop>",
    content: "Loop.",
    input: { value: "same" },
    run: async (context) => {
      observed.push(context.state.payload);
      return observed.length === 1
        ? { message: "again", route: "continue" }
        : { message: "done", route: "stop" };
    },
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await agentWithPhase(
      runtime,
      async function* () { yield { type: "done" }; }, {
        phases: new Map([[phase.name, phase]]),
        entryPhaseId: phase.name,
      },
      { idempotencyKey: "phase-payload-continue-agent" },
    );
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "phase-payload-continue-run" });

    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(observed).toEqual([{ value: "same" }, { value: "same" }]);
  } finally {
    await runtime.close();
  }
});

test("parallel routes prepare each target payload independently", async () => {
  const observed: Record<string, unknown> = {};
  const source: Phase = {
    name: "source",
    description: "Source",
    filePath: "<source>",
    baseDir: "<source>",
    content: "Source.",
    target: "join",
  };
  const worker = (name: string, fallback: string): Phase => ({
    name,
    description: name,
    filePath: `<${name}>`,
    baseDir: `<${name}>`,
    content: name,
    input: { value: fallback },
    run: async (context) => {
      observed[name] = context.state.payload;
      return { message: name, route: "stop" };
    },
  });
  const join: Phase = {
    name: "join",
    description: "Join",
    filePath: "<join>",
    baseDir: "<join>",
    content: "Join.",
    run: async () => ({ message: "joined", route: "stop" }),
  };
  const stream: StreamFn = async function* () {
    yield {
      type: "done",
      response: routeResponse([
        { phase: "left", payload: { value: "explicit" } },
        { phase: "right" },
      ]),
    };
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 2 });
  try {
    const agentId = await agentWithPhase(
      runtime,
      stream, {
        phases: new Map([
          [source.name, source],
          ["left", worker("left", "left-default")],
          ["right", worker("right", "right-default")],
          [join.name, join],
        ]),
        entryPhaseId: source.name,
      },
      { idempotencyKey: "phase-payload-parallel-agent" },
    );
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "phase-payload-parallel-run" });

    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(observed).toEqual({
      left: { value: "explicit" },
      right: { value: "right-default" },
    });
  } finally {
    await runtime.close();
  }
});
