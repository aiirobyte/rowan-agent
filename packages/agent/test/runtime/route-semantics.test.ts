import { expect, test } from "bun:test";
import Type from "typebox";
import type { StreamFn } from "@rowan-agent/models";
import { AgentRuntime, InMemoryStore } from "@rowan-agent/agent/runtime";
import type { Tool } from "@rowan-agent/agent";
import type { Phase } from "../../src/harness/phases/types";
import { createDefaultPhase, createStopPhase } from "../../src/harness/phases/core-phases";
import { createRouteTool } from "../../src/harness/tools/route-tool";
import { createAgentWith } from "../fixtures/configuration";
import { routeResponse, stopResponse } from "./route-test-utils";

function routeAgent(
  runtime: AgentRuntime,
  stream: StreamFn,
  phases?: { phases: Map<string, Phase>; entryPhaseId: string | null },
  maxAttempts?: number,
  tools: readonly Tool[] = [],
  options: { idempotencyKey?: string } = {},
) {
  const values = phases ? [...phases.phases.values()] : [];
  return createAgentWith(runtime, {
    identity: "route-semantics-v1",
    stream,
    ...(phases ? {
      phases: values,
      definition: {
        phases: { entryPhaseId: phases.entryPhaseId, phaseIds: values.map(({ name }) => name) },
      },
    } : {}),
    ...(tools.length > 0 ? { tools } : {}),
    ...(maxAttempts === undefined ? {} : { maxAttempts }),
    options,
  });
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
    const agentId = await routeAgent(runtime, stream, undefined, undefined, [], { idempotencyKey: "route-empty-stop-agent" });
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "route-empty-stop-run" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
  } finally {
    await runtime.close();
  }
});

test("Default and Stop Phases use concise, directive guidance", () => {
  const defaultPhase = createDefaultPhase();
  const stopPhase = createStopPhase();

  expect(defaultPhase.description).toBe("Execute the current user request using the current context.");
  expect(defaultPhase.content).toContain("Execute the current user request");
  expect(defaultPhase.content).toContain("route(stop) as the only target");
  expect(stopPhase.content).toContain("Return only a brief normal-exit explanation");
  expect(stopPhase.content).toContain("Never invent Backlog, Task, Context");
});

test("route(stop) executes the Stop Phase with a concise model conclusion", async () => {
  let modelCalls = 0;
  let stopPrompt = "";
  const stream: StreamFn = async function* (request) {
    modelCalls += 1;
    if (modelCalls === 1) {
      yield { type: "done", response: routeResponse([{ phase: "stop" }], "") };
      return;
    }
    stopPrompt = request.messages
      .map((message) => typeof message.content === "string" ? message.content : JSON.stringify(message.content))
      .join("\n");
    yield {
      type: "done",
      response: { content: "任务已完成，相关结果已经整理好。", stopReason: "stop" },
    };
  };
  // The Stop Phase is Rowan core's; a source cannot claim its name.
  const phases = new Map<string, Phase>([["work", workPhase()]]);
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await routeAgent(
      runtime,
      stream, { phases, entryPhaseId: "work" },
      undefined, [],
      { idempotencyKey: "route-stop-phase-agent" },
    );
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "route-stop-phase-run" });
    await expect(run.wait()).resolves.toMatchObject({
      type: "completed",
      outcome: { message: "任务已完成，相关结果已经整理好。" },
    });
    expect(modelCalls).toBe(2);
    expect(stopPrompt).toContain('<phase_content name="stop">');
    expect(stopPrompt).toContain("user's language");
    expect(stopPrompt).toContain("one or two sentences");
    expect(stopPrompt).toContain("Never invent Backlog, Task, Context");
    expect(stopPrompt).toContain("Do not greet, ask questions");
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
    const agentId = await routeAgent(
      runtime,
      stream, { phases, entryPhaseId: "work" },
      undefined, [],
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
    const agentId = await routeAgent(
      runtime,
      stream, { phases, entryPhaseId: "work" },
      undefined, [],
      { idempotencyKey: "route-default-from-work-agent" },
    );
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "route-default-from-work-run" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(modelCalls).toBe(2);
  } finally {
    await runtime.close();
  }
});

test("route(previous) returns to the Phase that routed into the current Phase", async () => {
  const phaseVisits: string[] = [];
  let modelCalls = 0;
  const stream: StreamFn = async function* (request) {
    modelCalls += 1;
    const messages = request.messages
      .map((message) => typeof message.content === "string" ? message.content : JSON.stringify(message.content))
      .join("\n");
    phaseVisits.push(messages.includes('<phase_content name="b">') ? "b" : "a");
    yield {
      type: "done",
      response: modelCalls === 1
        ? routeResponse([{ phase: "b" }], "")
        : modelCalls === 2
          ? routeResponse([{ phase: "previous" }], "")
          : stopResponse("finished"),
    };
  };
  const phases = new Map([
    ["a", workPhase({ name: "a" })],
    ["b", workPhase({ name: "b" })],
  ]) as Map<string, Phase>;
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await routeAgent(
      runtime,
      stream, { phases, entryPhaseId: "a" },
      undefined, [],
      { idempotencyKey: "route-previous-agent" },
    );
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "route-previous-run" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(phaseVisits).toEqual(["a", "b", "a"]);
  } finally {
    await runtime.close();
  }
});

test("Phase target previous returns to the Phase that routed into it", async () => {
  const phaseVisits: string[] = [];
  let modelCalls = 0;
  const stream: StreamFn = async function* (request) {
    modelCalls += 1;
    const messages = request.messages
      .map((message) => typeof message.content === "string" ? message.content : JSON.stringify(message.content))
      .join("\n");
    phaseVisits.push(messages.includes('<phase_content name="b">') ? "b" : "a");
    yield {
      type: "done",
      response: modelCalls === 1
        ? routeResponse([{ phase: "b" }], "")
        : modelCalls === 2
          ? { content: "back", stopReason: "stop" }
          : stopResponse("finished"),
    };
  };
  const phases = new Map([
    ["a", workPhase({ name: "a" })],
    ["b", workPhase({ name: "b", target: "previous" })],
  ]) as Map<string, Phase>;
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await routeAgent(
      runtime,
      stream, { phases, entryPhaseId: "a" },
      undefined, [],
      { idempotencyKey: "phase-target-previous-agent" },
    );
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "phase-target-previous-run" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(phaseVisits).toEqual(["a", "b", "a"]);
  } finally {
    await runtime.close();
  }
});

test("route(previous) from the entry Phase stops when no Phase transition exists", async () => {
  let modelCalls = 0;
  const stream: StreamFn = async function* () {
    modelCalls += 1;
    yield { type: "done", response: routeResponse([{ phase: "previous" }], "finished") };
  };
  const phases = new Map([["work", workPhase()]]) as Map<string, Phase>;
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await routeAgent(
      runtime,
      stream, { phases, entryPhaseId: "work" },
      undefined, [],
      { idempotencyKey: "route-previous-entry-agent" },
    );
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "route-previous-entry-run" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(modelCalls).toBe(1);
  } finally {
    await runtime.close();
  }
});

test("programmatic Phase returning route: previous re-enters previous phase", async () => {
  let aCalls = 0;
  const phaseA = workPhase({
    name: "a",
    run: async () => {
      aCalls += 1;
      return aCalls === 1
        ? { message: "go to b", route: "b" }
        : { message: "done in a", route: "stop" };
    },
  });
  const phaseB = workPhase({
    name: "b",
    run: async () => ({ message: "go back", route: "previous" }),
  });
  const phases = new Map([["a", phaseA], ["b", phaseB]]);
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await routeAgent(
      runtime,
      async function* () { yield { type: "done" }; },
      { phases, entryPhaseId: "a" },
      undefined, [],
      { idempotencyKey: "programmatic-route-previous-agent" },
    );
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "programmatic-route-previous-run" });
    const result = await run.wait();
    expect(result).toMatchObject({
      type: "completed",
      outcome: { message: "done in a" },
    });
    expect(aCalls).toBe(2);
  } finally {
    await runtime.close();
  }
});

test("durable runtime rejects configured Phase named previous", async () => {
  const runtime = await AgentRuntime.init({ store: new InMemoryStore() });
  try {
    const invalidConfig = {
      identity: "invalid-previous-agent",
      definition: {
        name: "test",
        prompt: "test",
        description: "test",
        phases: { entryPhaseId: "previous", phaseIds: ["previous"] },
      },
      resourceView: { agents: [], tools: [], skills: [], phases: [] },
      model: { provider: "test", id: "model" },
      resources: {
        tools: [],
        skills: [],
        phases: {
          entryPhaseId: "previous",
          phases: new Map([["previous", workPhase({ name: "previous" })]]),
        },
        revisions: { agent: [], tool: [], skill: [], phase: [] },
        refs: { agent: [], tool: [], skill: [], phase: [] },
      },
      contexts: [],
      additionalContexts: [],
    } as unknown as import("../../src/runtime/configuration-snapshot").AgentConfiguration;

    const agentId = await runtime.createAgent(invalidConfig);
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "test-run" });
    await expect(run.wait()).resolves.toMatchObject({
      type: "failed",
      failure: {
        message: 'Configured Phase name "previous" is reserved by Rowan routing controls.',
      },
    });
  } finally {
    await runtime.close();
  }
});

test("auto-invocable Phase guidelines join Tool guidelines once", async () => {
  const sharedGuideline = "Keep the result concise.";
  let systemPrompt = "";
  const stream: StreamFn = async function* (request) {
    systemPrompt = request.system ?? "";
    yield { type: "done", response: stopResponse("finished") };
  };
  const phases = [
    workPhase({ name: "work", promptGuidelines: [sharedGuideline] }),
    workPhase({ name: "selectable", promptGuidelines: ["Check assumptions."] }),
    workPhase({
      name: "hidden",
      disableAutoInvocation: true,
      promptGuidelines: ["Do not auto-invoke guidance."],
    }),
    workPhase({ name: "unselected", promptGuidelines: ["Unselected guidance."] }),
  ];
  const guidanceTool: Tool = {
    name: "guidance",
    description: "Guidance tool",
    parameters: Type.Object({}),
    promptGuidelines: [sharedGuideline],
    execute: async () => ({ ok: true, content: null }),
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await createAgentWith(runtime, {
      identity: "phase-guidelines-v1",
      stream,
      phases,
      tools: [guidanceTool],
      definition: {
        phases: {
          entryPhaseId: "work",
          phaseIds: ["work", "selectable", "hidden"],
        },
      },
      options: { idempotencyKey: "phase-guidelines-agent" },
    });
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "phase-guidelines-run" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(systemPrompt.match(/Keep the result concise\./g)).toHaveLength(1);
    expect(systemPrompt.match(/Check assumptions\./g)).toHaveLength(1);
    expect(systemPrompt).not.toContain("Do not auto-invoke guidance.");
    expect(systemPrompt).not.toContain("Unselected guidance.");
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
    const agentId = await routeAgent(
      runtime,
      stream, { phases, entryPhaseId: "work" },
      undefined, [],
      { idempotencyKey: "route-invalid-mixed-agent" },
    );
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "route-invalid-mixed-run" });
    await expect(run.wait()).resolves.toMatchObject({
      type: "input_required",
      interactions: [expect.objectContaining({ phase: "work", kind: "user_input", turnBoundary: true })],
    });
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
    const agentId = await routeAgent(
      runtime,
      stream, { phases, entryPhaseId: "work" },
      undefined, [],
      { idempotencyKey: "route-invalid-target-agent" },
    );
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "route-invalid-target-run" });
    await expect(run.wait()).resolves.toMatchObject({
      type: "input_required",
      interactions: [expect.objectContaining({ phase: "work" })],
    });
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
    const agentId = await routeAgent(
      runtime,
      stream, undefined, undefined, [lookup],
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
  expect(tool.description).toContain("final user-facing conclusion");
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
    const agentId = await routeAgent(
      runtime,
      async function* () { yield { type: "done" }; }, { phases, entryPhaseId: "work" }, 2, [],
      { idempotencyKey: "route-max-attempts-agent" },
    );
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "route-max-attempts-run" });
    await expect(run.wait()).resolves.toMatchObject({
      type: "input_required",
      interactions: [expect.objectContaining({
        phase: "work",
        prompt: expect.stringContaining("2"),
      })],
    });
  } finally {
    await runtime.close();
  }
});
