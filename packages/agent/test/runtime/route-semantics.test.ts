import { expect, test } from "bun:test";
import Type from "typebox";
import type { StreamFn } from "@rowan-agent/models";
import { AgentRuntime, InMemoryStore, type AgentConfig } from "../../src/runtime";
import type { Phase } from "../../src/harness/phases/types";
import { createRouteTool } from "../../src/harness/tools/route-tool";
import { routeResponse, stopResponse } from "./route-test-utils";

function config(
  stream: StreamFn,
  phases?: { phases: Map<string, Phase>; entryPhaseId: string | null },
  maxAttempts?: number,
  tools: AgentConfig["resources"]["tools"] = [],
): AgentConfig {
  return {
    identity: "route-semantics-v1",
    model: { provider: "test", id: "model" },
    stream,
    definition: { name: "test", description: "Test Agent.", prompt: "Test" },
    resources: {
      tools,
      skills: [],
      ...(phases ? { phases } : {}),
    },
    ...(maxAttempts === undefined ? {} : { maxAttempts }),
  } as unknown as AgentConfig;
}

function workPhase(overrides: Partial<Phase> = {}): Phase {
  return {
    name: "work",
    description: "Work",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Work",
    isolated: false,
    ...overrides,
  };
}

test("route(stop) completes even when the final response has no text", async () => {
  const stream: StreamFn = async function* () {
    yield { type: "done", response: stopResponse("") };
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await runtime.createAgent(config(stream), { idempotencyKey: "route-empty-stop-agent" });
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "route-empty-stop-run" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
  } finally {
    await runtime.close();
  }
});

test("route to the current non-default Phase performs one self-loop iteration", async () => {
  let modelCalls = 0;
  const stream: StreamFn = async function* () {
    modelCalls += 1;
    yield {
      type: "done",
      response: modelCalls === 1
        ? routeResponse([{ phase: "work" }], "loop")
        : stopResponse("finished"),
    };
  };
  const phases = new Map([["work", workPhase()]]) as Map<string, Phase>;
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await runtime.createAgent(
      config(stream, { phases, entryPhaseId: "work" }),
      { idempotencyKey: "route-self-loop-agent" },
    );
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "route-self-loop-run" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(modelCalls).toBe(2);
  } finally {
    await runtime.close();
  }
});

test("route(default) is available from every Phase", async () => {
  let modelCalls = 0;
  const stream: StreamFn = async function* () {
    modelCalls += 1;
    yield {
      type: "done",
      response: modelCalls === 1
        ? routeResponse([{ phase: "default" }], "use default")
        : stopResponse("finished"),
    };
  };
  const phases = new Map([["work", workPhase()]]) as Map<string, Phase>;
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await runtime.createAgent(
      config(stream, { phases, entryPhaseId: "work" }),
      { idempotencyKey: "route-default-from-work-agent" },
    );
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "route-default-from-work-run" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(modelCalls).toBe(2);
  } finally {
    await runtime.close();
  }
});

test("a mixed stop route is invalid and leaves the current Phase waiting for input", async () => {
  let modelCalls = 0;
  const stream: StreamFn = async function* () {
    modelCalls += 1;
    yield {
      type: "done",
      response: routeResponse([{ phase: "stop" }, { phase: "work" }], "choose one route"),
    };
  };
  const phases = new Map([["work", workPhase()]]) as Map<string, Phase>;
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await runtime.createAgent(
      config(stream, { phases, entryPhaseId: "work" }),
      { idempotencyKey: "route-invalid-mixed-agent" },
    );
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "route-invalid-mixed-run" });
    await expect(run.wait()).resolves.toMatchObject({ type: "input_required", phase: "work" });
    expect(modelCalls).toBe(1);
  } finally {
    await runtime.close();
  }
});

test("invalid ordinary route targets are ignored when no valid target remains", async () => {
  let modelCalls = 0;
  const stream: StreamFn = async function* () {
    modelCalls += 1;
    yield {
      type: "done",
      response: routeResponse([{ phase: "missing" }], "unknown target"),
    };
  };
  const phases = new Map([["work", workPhase()]]) as Map<string, Phase>;
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await runtime.createAgent(
      config(stream, { phases, entryPhaseId: "work" }),
      { idempotencyKey: "route-invalid-target-agent" },
    );
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "route-invalid-target-run" });
    await expect(run.wait()).resolves.toMatchObject({ type: "input_required", phase: "work" });
    expect(modelCalls).toBe(1);
  } finally {
    await runtime.close();
  }
});

test("a route sharing a response with an ordinary Tool is ignored until the next model round", async () => {
  let modelCalls = 0;
  let toolRuns = 0;
  const lookup = {
    name: "lookup",
    description: "Look up a value.",
    parameters: Type.Object({}),
    execute: async () => {
      toolRuns += 1;
      return { ok: true as const, content: "value" };
    },
  };
  const stream: StreamFn = async function* () {
    modelCalls += 1;
    if (modelCalls === 1) {
      yield {
        type: "done",
        response: {
          content: "",
          toolCalls: [
            { id: "route-mixed", name: "route", arguments: JSON.stringify({ decision: [{ phase: "stop" }] }) },
            { id: "lookup-mixed", name: "lookup", arguments: "{}" },
          ],
          stopReason: "tool_use" as const,
        },
      };
      return;
    }
    yield { type: "done", response: stopResponse("finished") };
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await runtime.createAgent(
      config(stream, undefined, undefined, [lookup]),
      { idempotencyKey: "route-mixed-tool-agent" },
    );
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "route-mixed-tool-run" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(modelCalls).toBe(2);
    expect(toolRuns).toBe(1);
  } finally {
    await runtime.close();
  }
});

test("serial route tool text documents optional routing and explicit stop semantics", () => {
  const tool = createRouteTool([workPhase()]);
  expect(tool.description).toContain("Route is optional");
  expect(tool.description).toContain("no further user input is needed");
  expect(tool.description).toContain("current phase starts another iteration");
  expect(tool.promptSnippet).toContain("omit it");
});

test("maxAttempts suspends an autonomous self-loop instead of implicitly stopping", async () => {
  const phase = workPhase({
    run: async () => ({ message: "again", route: "work" }),
  });
  const phases = new Map([["work", phase]]) as Map<string, Phase>;
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await runtime.createAgent(
      config(async function* () { yield { type: "done" }; }, { phases, entryPhaseId: "work" }, 2),
      { idempotencyKey: "route-max-attempts-agent" },
    );
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "route-max-attempts-run" });
    await expect(run.wait()).resolves.toMatchObject({
      type: "input_required",
      phase: "work",
      prompt: expect.objectContaining({ content: expect.stringContaining("2") }),
    });
  } finally {
    await runtime.close();
  }
});
