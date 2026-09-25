import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRuntime, InMemoryStore, SqliteStore, type AgentConfiguration, type DurableStore, type RunEvent, type ToolInvocationContext } from "../../src/runtime";
import Type from "typebox";
import type { StreamFn } from "@rowan-agent/models";
import type { RunId } from "../../src/runtime-events";
import type { Phase } from "../../src/harness/phases/types";
import { loadExtensionFromFactory } from "../../src/extensions/loader";
import { configuration, createAgentWith, createPhaseAgent, seedResources, testDefinition } from "../fixtures/configuration";
import { stopResponse } from "./route-test-utils";

type SimpleAgentOverrides = Readonly<Pick<
  NonNullable<Parameters<typeof createAgentWith>[1]>,
  "definition" | "model" | "tools" | "skills" | "phases" | "contexts" | "additionalContexts"
>>;

/** The Agent every test in this file creates unless it says otherwise. */
function simpleAgent(
  runtime: AgentRuntime,
  stream: StreamFn,
  options: NonNullable<Parameters<AgentRuntime["createAgent"]>[1]> = {},
  overrides: SimpleAgentOverrides = {},
) {
  return createAgentWith(runtime, { identity: "runtime-test-v1", stream, core: true, options, ...overrides });
}

test("AgentRuntime contains expired ownership at the background pump boundary", async () => {
  const runtime = await AgentRuntime.init({ store: new InMemoryStore() });
  const inspectable = runtime as unknown as {
    heartbeat?: ReturnType<typeof setInterval>;
    pumping: boolean;
    pump(): Promise<void>;
  };
  while (inspectable.pumping) await Bun.sleep(1);
  if (inspectable.heartbeat) clearInterval(inspectable.heartbeat);

  const realNow = Date.now;
  const startedAt = realNow();
  Date.now = () => startedAt + 30_001;
  try {
    await expect(inspectable.pump()).resolves.toBeUndefined();
  } finally {
    Date.now = realNow;
    await runtime.close();
  }
});

test("AgentRuntime generates a unique idempotency key for ordinary Agent creation", async () => {
  const stream: StreamFn = async function* () { yield { type: "done" }; };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore() });
  try {
    const first = await simpleAgent(runtime, stream);
    const second = await simpleAgent(runtime, stream, { metadata: { source: "test" } });

    expect(second).not.toBe(first);
    const agents = (await runtime.listAgents()).items;
    expect(agents.map((agent) => agent.id).sort()).toEqual([first, second].sort());
    expect(agents.find((agent) => agent.id === second)).toMatchObject({ metadata: { source: "test" } });
  } finally {
    await runtime.close();
  }
});

test("AgentRuntime replays Agent creation when the caller supplies a stable idempotency key", async () => {
  const stream: StreamFn = async function* () { yield { type: "done" }; };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore() });
  try {
    const definition = testDefinition();
    const view = await seedResources(runtime, { agents: [definition], core: true });
    const config = configuration({
      identity: "runtime-test-v1",
      definition: definition.name,
      view,
      model: { provider: "test", id: "model" },
      stream,
    });
    const first = await runtime.createAgent(config, { idempotencyKey: "create-request-1" });
    const replay = await runtime.createAgent(config, { idempotencyKey: "create-request-1" });

    expect(replay).toBe(first);
    expect((await runtime.listAgents()).items).toHaveLength(1);
  } finally {
    await runtime.close();
  }
});

test("AgentRuntime runs a queued Run through claim and completion", async () => {
  const stream: StreamFn = async function* () {
    const text = "done";
    yield { type: "start", partial: { role: "assistant", contentBlocks: [] } };
    yield { type: "text_delta", text, partial: { role: "assistant", contentBlocks: [{ type: "text", text }] } };
    yield { type: "done", response: stopResponse(text) };
  };
  const store = new InMemoryStore();
  const runtime = await AgentRuntime.init({ store, concurrency: 1 });
  try {
    const agentId = await simpleAgent(runtime, stream, { idempotencyKey: "agent-1" });
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "run-1" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    await expect(run.snapshot()).resolves.toMatchObject({ state: "completed", outcome: { message: expect.any(String) } });
  } finally {
    await runtime.close();
  }
});

test("AgentRuntime injects additional Contexts into the System Prompt", async () => {
  const requests: Parameters<StreamFn>[0][] = [];
  const stream: StreamFn = async function* (input) {
    requests.push(input);
    yield { type: "text_delta", text: "done", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "done" }] } };
    yield { type: "done", response: stopResponse("done") };
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await simpleAgent(runtime, stream, { idempotencyKey: "host-context-agent" }, {
      additionalContexts: [{ name: "explicit", value: { instruction: "Review carefully." } }],
    });
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "host-context-run" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });

    const history = await runtime.history(agentId);
    expect(history.filter(({ role }) => role === "user")).toHaveLength(1);
    expect(history[0]).toMatchObject({ role: "user", content: "hello" });
    expect(requests[0]?.system).toContain('<context name="explicit">');
    expect(requests[0]?.system).toContain("Review carefully.");
    const userMessages = requests[0]?.messages.filter((message) => message.role === "user") ?? [];
    expect(userMessages.some((message) => String(message.content).includes("Review carefully."))).toBe(false);
  } finally {
    await runtime.close();
  }
});

test("AgentRuntime preserves manual Control Run input while keeping system compaction non-conversational", async () => {
  let calls = 0;
  const requests: string[][] = [];
  const stream: StreamFn = async function* (input) {
    calls += 1;
    requests.push(input.messages.map((message) =>
      typeof message.content === "string"
        ? message.content
        : message.content.map((part) => part.type === "text" ? part.text : "[part]").join("")));
    const text = calls === 1 ? "ordinary reply" : "durable summary";
    yield { type: "text_delta", text, partial: { role: "assistant", contentBlocks: [{ type: "text", text }] } };
    yield { type: "done", response: stopResponse(text) };
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await simpleAgent(runtime, stream, { idempotencyKey: "compact-agent" });
    const ordinary = await runtime.start(agentId, "hello", { idempotencyKey: "compact-ordinary" });
    await expect(ordinary.wait()).resolves.toMatchObject({ type: "completed" });
    const before = await runtime.history(agentId);
    const compact = await runtime.compactContext(agentId, {
      input: "/compact Keep the architecture decisions.",
    });
    const observedPromise = (async () => {
      const observed: RunEvent[] = [];
      for await (const event of compact.observe()) {
        observed.push(event);
        if (event.kind === "run_state_changed" && ["completed", "failed", "cancelled"].includes(event.to)) break;
      }
      return observed;
    })();
    await expect(compact.wait()).resolves.toMatchObject({ type: "completed" });
    const observed = await observedPromise;
    expect(observed.filter((event) => event.kind === "phase_status").map((event) => event.status)).toEqual([
      expect.objectContaining({ state: "running", kind: "compacting" }),
      expect.objectContaining({ state: "completed", kind: "compacted" }),
    ]);
    const after = await runtime.history(agentId);
    expect(after).toHaveLength(before.length + 1);
    expect(after.at(-1)).toMatchObject({
      role: "user",
      content: "/compact Keep the architecture decisions.",
    });
    expect(requests[1]).toContain("Additional compaction instructions:\nKeep the architecture decisions.");
    expect((await runtime.contextStatus(agentId)).coveredThrough?.messageId).toBe(after.at(-1)?.id);
    const compactSnapshot = await compact.snapshot();
    expect("output" in compactSnapshot ? compactSnapshot.output : undefined).toBeUndefined();

    const systemCompact = await runtime.compactContext(agentId);
    await expect(systemCompact.wait()).resolves.toMatchObject({ type: "completed" });
    expect(requests[2]).not.toContain("Additional compaction instructions:");
    await expect(runtime.history(agentId)).resolves.toHaveLength(after.length);
  } finally {
    await runtime.close();
  }
});

test("AgentRuntime allows manual compaction while a Run waits for input", async () => {
  const phases = new Map<string, Phase>([["plan", {
    name: "plan",
    description: "Plan",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Plan",
    isolated: false,
  }]]);
  const stream: StreamFn = async function* () {
    const text = "Which target?";
    yield { type: "text_delta", text, partial: { role: "assistant", contentBlocks: [{ type: "text", text }] } };
    yield { type: "done", response: { content: text, stopReason: "stop" } };
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await createPhaseAgent(runtime, {
      identity: "runtime-test-v1",
      stream,
      phases: { phases, entryPhaseId: "plan" },
      options: { idempotencyKey: "input-compact-agent" },
    });
    const waiting = await runtime.start(agentId, "hello", { idempotencyKey: "input-compact-run" });
    await expect(waiting.wait()).resolves.toMatchObject({ type: "input_required" });

    const compact = await runtime.compactContext(agentId);
    await expect(compact.wait()).resolves.toMatchObject({ type: "completed" });
    expect((await runtime.contextStatus(agentId)).coveredThrough).toBeDefined();
    expect((await waiting.snapshot()).state).toBe("input_required");
  } finally {
    await runtime.close();
  }
});

test("input_required preserves the current assistant thinking parts", async () => {
  const thinking = "Reasoning before asking for the next input.";
  const text = "Which target?";
  const stream: StreamFn = async function* () {
    yield { type: "start", partial: { role: "assistant", contentBlocks: [] } };
    yield {
      type: "thinking_delta",
      thinking,
      partial: {
        role: "assistant",
        contentBlocks: [{ type: "thinking", thinking }],
      },
    };
    yield {
      type: "text_delta",
      text,
      partial: {
        role: "assistant",
        contentBlocks: [
          { type: "thinking", thinking },
          { type: "text", text },
        ],
      },
    };
    yield { type: "done", response: { content: text, thinking, stopReason: "stop" } };
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await simpleAgent(runtime, stream, {
      idempotencyKey: "input-thinking-agent",
    });
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "input-thinking-run" });
    await expect(run.wait()).resolves.toMatchObject({ type: "input_required" });

    const assistant = (await runtime.history(agentId)).find(({ role }) => role === "assistant");
    expect(assistant?.content).toEqual([
      { type: "thinking", thinking },
      { type: "text", text },
    ]);
  } finally {
    await runtime.close();
  }
});

test("AgentRuntime routes an over-threshold queued Run through automatic compaction", async () => {
  const calls: string[][] = [];
  const stream: StreamFn = async function* (input) {
    calls.push(input.messages.map((message) => typeof message.content === "string" ? message.content : "[parts]"));
    const text = "done";
    yield { type: "text_delta", text, partial: { role: "assistant", contentBlocks: [{ type: "text", text }] } };
    yield { type: "done", response: stopResponse(text) };
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await simpleAgent(runtime, stream, {
      idempotencyKey: "auto-compact-agent",
      historySeed: [{
        id: "seed-user" as never,
        agentId: "seed-agent" as never,
        runId: "seed-run" as never,
        role: "user",
        content: "x".repeat(20_000),
        sequenceWithinRun: 0,
        createdAt: "2026-08-14T00:00:00.000Z",
      }],
    }, { model: { provider: "test", id: "model", contextWindow: 20_000 } });
    const run = await runtime.start(agentId, "next", { idempotencyKey: "auto-compact-run" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(calls).toHaveLength(2);
    expect(calls[0]?.some((message) => message.includes("x".repeat(100)))).toBe(true);
    expect(calls[1]?.some((message) => message.includes("[Context summary]"))).toBe(true);
    expect((await runtime.contextStatus(agentId)).coveredThrough).toBeDefined();
  } finally {
    await runtime.close();
  }
});

test("AgentRuntime compacts once and retries after a provider context overflow", async () => {
  let calls = 0;
  const stream: StreamFn = async function* (input) {
    calls += 1;
    const isCompaction = input.messages.some((message) =>
      typeof message.content === "string" && message.content.includes('<phase_content name="compact">'));
    if (calls === 1) throw new Error("provider context window exceeded");
    const text = isCompaction ? "overflow summary" : "retried reply";
    yield { type: "text_delta", text, partial: { role: "assistant", contentBlocks: [{ type: "text", text }] } };
    yield { type: "done", response: stopResponse(text) };
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await simpleAgent(runtime, stream, { idempotencyKey: "overflow-agent" });
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "overflow-run" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(calls).toBe(3);
    expect((await runtime.history(agentId)).filter(({ role }) => role === "assistant").map(({ content }) => content)).toEqual(["retried reply"]);
    expect((await runtime.contextStatus(agentId)).coveredThrough).toBeDefined();
  } finally {
    await runtime.close();
  }
});

test("Message revisions stop at the covered context boundary", async () => {
  const stream: StreamFn = async function* () {
    const text = "summary";
    yield { type: "text_delta", text, partial: { role: "assistant", contentBlocks: [{ type: "text", text }] } };
    yield { type: "done", response: stopResponse(text) };
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await simpleAgent(runtime, stream, { idempotencyKey: "edit-boundary-agent" });
    const run = await runtime.start(agentId, "original", { idempotencyKey: "edit-boundary-run" });
    await run.wait();
    const message = (await runtime.history(agentId)).find(({ role }) => role === "user");
    expect(message).toBeDefined();
    const compact = await runtime.compactContext(agentId);
    await expect(compact.wait()).resolves.toMatchObject({ type: "completed" });
    await expect(runtime.revise(agentId, {
      messageId: message!.id,
      expectedMessageRevision: 0,
      content: "edited",
      operationId: "edit-covered-message",
    })).rejects.toMatchObject({ code: "message_history_compacted" });
  } finally {
    await runtime.close();
  }
});

test("AgentRuntime forwards the user ThinkingLevel on the LLM Request", async () => {
  const requests: Parameters<StreamFn>[0][] = [];
  const stream: StreamFn = async function* (input) {
    requests.push(input);
    const text = "done";
    yield { type: "text_delta", text, partial: { role: "assistant", contentBlocks: [{ type: "text", text }] } };
    yield { type: "done", response: stopResponse(text) };
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await simpleAgent(runtime, stream, { idempotencyKey: "thinking-level-agent" });
    const run = await runtime.start(agentId, {
      content: "Think carefully",
      metadata: { everyield: { thinkingLevel: "high" } },
    }, { idempotencyKey: "thinking-level-run" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });

    const offRun = await runtime.start(agentId, {
      content: "Do not reason",
      metadata: { everyield: { thinkingLevel: "off" } },
    }, { idempotencyKey: "thinking-level-off-run" });
    await expect(offRun.wait()).resolves.toMatchObject({ type: "completed" });

    expect(requests.map(({ thinkingLevel }) => thinkingLevel)).toEqual(["high", "off"]);
  } finally {
    await runtime.close();
  }
});

test("a failed Definition Snapshot fails the queued Run instead of leaving it stuck", async () => {
  const stream: StreamFn = async function* () {
    yield { type: "done", response: { content: "unused", stopReason: "stop" } };
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const config: AgentConfiguration = {
      identity: "missing-definition-v1",
      definition: { name: "missing" },
      resourceView: { agents: ["missing-source"], tools: [], skills: [], phases: [] },
      model: { provider: "test", id: "model" },
      stream,
    };
    const agentId = await runtime.createAgent(config, { idempotencyKey: "agent-missing-definition" });
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "run-missing-definition" });
    await expect(run.wait()).resolves.toMatchObject({ type: "failed", failure: { code: "configuration_unavailable" } });
    expect((await run.snapshot()).state).toBe("failed");
  } finally {
    await runtime.close();
  }
});

test("AgentRun.observe streams message deltas before the durable boundary", async () => {
  let releaseFirstDelta!: () => void;
  const firstDelta = new Promise<void>((resolve) => { releaseFirstDelta = resolve; });
  let releaseCompletion!: () => void;
  const completion = new Promise<void>((resolve) => { releaseCompletion = resolve; });
  const stream: StreamFn = async function* () {
    await firstDelta;
    yield {
      type: "text_delta",
      text: "Hel",
      partial: { role: "assistant", contentBlocks: [{ type: "text", text: "Hel" }] },
    };
    await completion;
    yield {
      type: "text_delta",
      text: "lo",
      partial: { role: "assistant", contentBlocks: [{ type: "text", text: "Hello" }] },
    };
    yield { type: "done", response: stopResponse("Hello") };
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await simpleAgent(runtime, stream, { idempotencyKey: "agent-live-observe" });
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "run-live-observe" });
    const observed: RunEvent[] = [];
    const iterator = run.observe()[Symbol.asyncIterator]();
    const next = async () => {
      const result = await iterator.next();
      if (!result.done) observed.push(result.value);
      return result;
    };
    while (true) {
      const result = await next();
      if (result.done || (result.value.kind === "run_state_changed" && result.value.to === "running")) break;
    }
    let boundarySettled = false;
    const boundary = run.wait().then((value) => {
      boundarySettled = true;
      return value;
    });

    const firstDelta = next();
    releaseFirstDelta();
    await expect(firstDelta).resolves.toMatchObject({
      done: false,
      value: { kind: "message_delta", offset: 0, text: "Hel" },
    });
    const boundarySettledAtFirstDelta = boundarySettled;
    const secondDelta = next();
    releaseCompletion();
    await expect(secondDelta).resolves.toMatchObject({
      done: false,
      value: { kind: "message_delta", offset: 3, text: "lo" },
    });
    await boundary;
    while (!(await next()).done) {}

    expect(boundarySettledAtFirstDelta).toBe(false);
    const deltas = observed.filter((event) => event.kind === "message_delta");
    expect(deltas.map((event) => ({ offset: event.offset, text: event.text }))).toEqual([
      { offset: 0, text: "Hel" },
      { offset: 3, text: "lo" },
    ]);
    expect(new Set(deltas.map((event) => event.messageId)).size).toBe(1);
    const committed = observed.find(
      (event): event is Extract<RunEvent, { kind: "message_committed" }> =>
        event.kind === "message_committed" && event.message.role === "assistant",
    );
    expect(committed?.message.id).toBe(deltas[0]?.messageId);
    expect(observed.at(-1)).toMatchObject({
      kind: "run_state_changed",
      to: "completed",
    });
  } finally {
    releaseFirstDelta();
    releaseCompletion();
    await runtime.close();
  }
});

test("AgentRun.observe streams ThinkingBlock deltas before the durable boundary", async () => {
  let releaseThinking!: () => void;
  const thinkingReady = new Promise<void>((resolve) => { releaseThinking = resolve; });
  let releaseSecondThinking!: () => void;
  const secondThinkingReady = new Promise<void>((resolve) => { releaseSecondThinking = resolve; });
  let releaseCompletion!: () => void;
  const completion = new Promise<void>((resolve) => { releaseCompletion = resolve; });
  const thinking = "First thought. Second thought.";
  const stream: StreamFn = async function* () {
    yield { type: "start", partial: { role: "assistant", contentBlocks: [] } };
    await thinkingReady;
    yield {
      type: "thinking_delta",
      thinking: "First thought. ",
      partial: {
        role: "assistant",
        contentBlocks: [{ type: "thinking", thinking: "First thought. " }],
      },
    };
    yield {
      type: "thinking_delta",
      thinking: "Second thought.",
      partial: {
        role: "assistant",
        contentBlocks: [{ type: "thinking", thinking }],
      },
    };
    await secondThinkingReady;
    yield {
      type: "text_delta",
      text: "Done",
      partial: {
        role: "assistant",
        contentBlocks: [
          { type: "thinking", thinking },
          { type: "text", text: "Done" },
        ],
      },
    };
    await completion;
    yield { type: "done", response: stopResponse("Done") };
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await simpleAgent(runtime, stream, {
      idempotencyKey: "agent-thinking-observe",
    });
    const run = await runtime.start(agentId, "hello", {
      idempotencyKey: "run-thinking-observe",
    });
    const observed: RunEvent[] = [];
    const iterator = run.observe()[Symbol.asyncIterator]();
    const next = async () => {
      const result = await iterator.next();
      if (!result.done) observed.push(result.value);
      return result;
    };
    while (true) {
      const result = await next();
      if (result.done || (result.value.kind === "run_state_changed" && result.value.to === "running")) break;
    }

    const boundary = run.wait();
    const firstThinking = next();
    releaseThinking();
    await expect(firstThinking).resolves.toMatchObject({
      done: false,
      value: { kind: "thinking_delta", blockIndex: 0, offset: 0, text: "First thought. " },
    });
    const secondThinking = next();
    releaseSecondThinking();
    await expect(secondThinking).resolves.toMatchObject({
      done: false,
      value: { kind: "thinking_delta", blockIndex: 0, offset: 15, text: "Second thought." },
    });
    releaseCompletion();
    await boundary;
    while (!(await next()).done) {}

    const deltas = observed.filter((event) => event.kind === "thinking_delta");
    expect(deltas.map((event) => ({
      blockIndex: event.blockIndex,
      offset: event.offset,
      text: event.text,
    }))).toEqual([
      { blockIndex: 0, offset: 0, text: "First thought. " },
      { blockIndex: 0, offset: 15, text: "Second thought." },
    ]);
  } finally {
    releaseThinking();
    releaseSecondThinking();
    releaseCompletion();
    await runtime.close();
  }
});

test("AgentRuntime routes Tool execution through durable lifecycle", async () => {
  let modelCalls = 0;
  let toolContext: { runId: string; toolCallId: string } | undefined;
  const tool = {
    name: "lookup",
    description: "Look up a value.",
    parameters: Type.Object({ query: Type.String() }),
    async execute(_args: unknown, context: { runId: string; toolCallId: string }) {
      toolContext = context;
      return { ok: true as const, content: { value: 42 } };
    },
  };
  const stream: StreamFn = async function* (request) {
    modelCalls += 1;
    if (modelCalls === 1) {
      const id = "call_lookup";
      const args = JSON.stringify({ query: "rowan" });
      const partial = { role: "assistant" as const, contentBlocks: [{ type: "tool_call" as const, id, name: tool.name, args }] };
      yield { type: "tool_call_start", id, name: tool.name, partial };
      yield { type: "tool_call_delta", id, arguments: args, partial };
      yield { type: "tool_call_end", id, name: tool.name, arguments: args, partial };
      yield { type: "done" };
      return;
    }
    const hasResult = request.messages.some((message) => Array.isArray(message.content) && message.content.some((part) => part.type === "tool_result"));
    if (!hasResult) throw new Error("model did not receive the Tool result");
    const text = "lookup complete";
    yield { type: "text_delta", text, partial: { role: "assistant", contentBlocks: [{ type: "text", text }] } };
    yield { type: "done", response: stopResponse("lookup complete") };
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await simpleAgent(runtime, stream, {
      idempotencyKey: "agent-tool-lifecycle",
    }, { tools: [tool] });
    const run = await runtime.start(agentId, "use lookup", { idempotencyKey: "run-tool-lifecycle" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(modelCalls).toBe(2);
    expect(toolContext?.runId).toBe(run.id);
    expect(toolContext?.toolCallId).toMatch(/^tool_/);
    const observed = [];
    for await (const event of run.observe()) observed.push(event);
    const toolEvents = observed.filter((event) => event.kind === "tool_state_changed");
    expect(toolEvents.map((event) => event.transition.to)).toEqual(["pending", "running", "completed"]);
    expect(await run.snapshot()).toMatchObject({ state: "completed", toolCallCount: 1 });
  } finally {
    await runtime.close();
  }
});

test("AgentRuntime spills large custom Tool Results to the Agent archive", async () => {
  let modelCalls = 0;
  const payload = "custom-result\n" + "z".repeat(20_000);
  const tool = {
    name: "large_lookup",
    description: "Return a large value.",
    parameters: Type.Object({}),
    async execute() {
      return { ok: true as const, content: payload };
    },
  };
  const stream: StreamFn = async function* (request) {
    modelCalls += 1;
    if (modelCalls === 1) {
      const id = "call_large_lookup";
      const args = "{}";
      const partial = { role: "assistant" as const, contentBlocks: [{ type: "tool_call" as const, id, name: tool.name, args }] };
      yield { type: "tool_call_start", id, name: tool.name, partial };
      yield { type: "tool_call_end", id, name: tool.name, arguments: args, partial };
      yield { type: "done" };
      return;
    }
    const toolResult = request.messages.flatMap((message) => Array.isArray(message.content) ? message.content : [])
      .find((part) => part.type === "tool_result");
    expect(toolResult && "content" in toolResult ? toolResult.content : "").toContain("Full result:");
    yield { type: "text_delta", text: "large lookup complete", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "large lookup complete" }] } };
    yield { type: "done", response: stopResponse("large lookup complete") };
  };
  const directory = await mkdtemp(join(tmpdir(), "rowan-tool-archive-"));
  const store = new SqliteStore(join(directory, "runtime.sqlite"));
  const runtime = await AgentRuntime.init({ store, concurrency: 1 });
  try {
    const agentId = await createAgentWith(runtime, {
      identity: "runtime-test-v1",
      stream,
      core: true,
      tools: [tool],
      options: { idempotencyKey: "large-tool-agent" },
    });
    const run = await runtime.start(agentId, "use large lookup", { idempotencyKey: "large-tool-run" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    const toolMessage = (await runtime.history(agentId)).find((message) => message.role === "tool");
    const content = toolMessage && Array.isArray(toolMessage.content)
      ? toolMessage.content[0]?.result.content
      : undefined;
    const path = typeof content === "string"
      ? content.match(/Full result: (.+)/)?.[1]?.split("\n")[0]
      : undefined;
    expect(path).toBeDefined();
    expect(await readFile(path!, "utf8")).toBe(payload);
  } finally {
    await runtime.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("AgentRuntime atomically commits one assistant Tool-use Message for a multi-tool response", async () => {
  let modelCalls = 0;
  const executions: string[] = [];
  const tools = ["first", "second"].map((name) => ({
    name,
    description: `${name} tool`,
    parameters: Type.Object({ value: Type.String() }),
    async execute(_args: unknown, context: ToolInvocationContext) {
      executions.push(`${name}:${context.toolCallId}`);
      return { ok: true as const, content: { name } };
    },
  }));
  const stream: StreamFn = async function* (request) {
    modelCalls += 1;
    if (modelCalls === 1) {
      const calls = tools.map((tool, index) => ({
        id: `provider-${index + 1}`,
        name: tool.name,
        args: JSON.stringify({ value: tool.name }),
      }));
      const partial = {
        role: "assistant" as const,
        contentBlocks: calls.map((call) => ({
          type: "tool_call" as const,
          id: call.id,
          name: call.name,
          args: call.args,
        })),
      };
      for (const call of calls) {
        yield { type: "tool_call_start", id: call.id, name: call.name, partial };
        yield { type: "tool_call_end", id: call.id, name: call.name, arguments: call.args, partial };
      }
      yield {
        type: "done",
        response: {
          content: "",
          toolCalls: calls.map((call) => ({ id: call.id, name: call.name, arguments: call.args })),
          stopReason: "tool_use",
        },
      };
      return;
    }

    const assistantToolMessages = request.messages.filter((message) =>
      message.role === "assistant"
      && Array.isArray(message.content)
      && message.content.filter((part) => part.type === "tool_use").length > 0,
    );
    expect(assistantToolMessages).toHaveLength(1);
    const assistantToolContent = assistantToolMessages[0]!.content;
    expect(Array.isArray(assistantToolContent)).toBe(true);
    if (!Array.isArray(assistantToolContent)) return;
    const toolUses = assistantToolContent.filter((part) => part.type === "tool_use");
    expect(toolUses.map((part) => part.type === "tool_use" ? part.id : "")).toEqual(["provider-1", "provider-2"]);
    const toolResults = request.messages.flatMap((message) =>
      message.role === "tool" && Array.isArray(message.content)
        ? message.content.filter((part) => part.type === "tool_result")
        : [],
    );
    expect(toolResults.map((part) => part.type === "tool_result" ? part.toolUseId : "")).toEqual(["provider-1", "provider-2"]);
    yield {
      type: "text_delta",
      text: "both complete",
      partial: { role: "assistant", contentBlocks: [{ type: "text", text: "both complete" }] },
    };
    yield { type: "done", response: stopResponse("both complete") };
  };

  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await simpleAgent(runtime, stream, { idempotencyKey: "agent-multi-tool" }, { tools });
    const run = await runtime.start(agentId, "use both", { idempotencyKey: "run-multi-tool" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(modelCalls).toBe(2);
    expect(executions).toHaveLength(2);
    const observed: RunEvent[] = [];
    for await (const event of run.observe()) observed.push(event);
    const assistantToolMessages = observed.filter((event) =>
      event.kind === "message_committed"
      && event.message.role === "assistant"
      && Array.isArray(event.message.content)
      && event.message.content.some((part) => part.type === "tool_use"),
    );
    expect(assistantToolMessages).toHaveLength(1);
    expect(await run.snapshot()).toMatchObject({ state: "completed", toolCallCount: 2 });
  } finally {
    await runtime.close();
  }
});

test("AgentRun.observe streams best-effort Tool progress", async () => {
  let releaseModel!: () => void;
  const modelReady = new Promise<void>((resolve) => { releaseModel = resolve; });
  let releaseTool!: () => void;
  const toolReady = new Promise<void>((resolve) => { releaseTool = resolve; });
  let modelCalls = 0;
  const tool = {
    name: "progress_lookup",
    description: "Look up a value with progress.",
    parameters: Type.Object({}),
    async execute(_args: unknown, context: ToolInvocationContext) {
      context.reportProgress({ stage: "halfway" });
      await toolReady;
      return { ok: true as const, content: { value: 42 } };
    },
  };
  const stream: StreamFn = async function* () {
    modelCalls += 1;
    if (modelCalls === 1) {
      await modelReady;
      const id = "call_progress";
      const partial = {
        role: "assistant" as const,
        contentBlocks: [{ type: "tool_call" as const, id, name: tool.name, args: "{}" }],
      };
      yield { type: "tool_call_start", id, name: tool.name, partial };
      yield { type: "tool_call_end", id, name: tool.name, arguments: "{}", partial };
      yield { type: "done" };
      return;
    }
    yield {
      type: "text_delta",
      text: "done",
      partial: { role: "assistant", contentBlocks: [{ type: "text", text: "done" }] },
    };
    yield { type: "done", response: stopResponse("done") };
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await simpleAgent(runtime, stream, { idempotencyKey: "agent-tool-progress" }, { tools: [tool] });
    const run = await runtime.start(agentId, "use lookup", { idempotencyKey: "run-tool-progress" });
    const observed: RunEvent[] = [];
    const iterator = run.observe()[Symbol.asyncIterator]();
    const next = async () => {
      const result = await iterator.next();
      if (!result.done) observed.push(result.value);
      return result;
    };
    while (true) {
      const result = await next();
      if (result.done || (result.value.kind === "run_state_changed" && result.value.to === "running")) break;
    }
    const progress = next();
    releaseModel();
    let progressResult = await progress;
    while (!progressResult.done && progressResult.value.kind !== "tool_progress") {
      progressResult = await next();
    }
    releaseTool();
    await run.wait();
    while (!(await next()).done) {}

    expect(observed.find((event) => event.kind === "tool_progress")).toMatchObject({
      progress: { stage: "halfway" },
    });
  } finally {
    releaseModel();
    releaseTool();
    await runtime.close();
  }
});

test("AgentRuntime assembles extension Tools and hooks into a Run", async () => {
  let beforeCalls = 0;
  let afterCalls = 0;
  let contextMessages = 0;
  const extension = loadExtensionFromFactory((api) => {
    api.tool.register({
      name: "extension_lookup",
      description: "Look up a value from an extension.",
      parameters: { type: "object", properties: { query: { type: "string" } } },
      execute: async () => ({ content: [{ type: "text", text: "42" }] }),
    });
    api.on("before_tool_call", () => {
      beforeCalls += 1;
      contextMessages = api.context.getMessages?.().length ?? 0;
      return { allow: true };
    });
    api.on("after_tool_call", (event) => {
      afterCalls += 1;
      return { result: { ...event.result, content: { wrapped: event.result.content } } };
    });
  }, process.cwd(), "<runtime-extension>");
  let modelCalls = 0;
  const stream: StreamFn = async function* (request) {
    modelCalls += 1;
    if (modelCalls === 1) {
      expect(request.tools?.some((tool) => tool.name === "extension_lookup")).toBe(true);
      const id = "call_extension_lookup";
      const args = JSON.stringify({ query: "rowan" });
      const partial = { role: "assistant" as const, contentBlocks: [{ type: "tool_call" as const, id, name: "extension_lookup", args }] };
      yield { type: "tool_call_start", id, name: "extension_lookup", partial };
      yield { type: "tool_call_delta", id, arguments: args, partial };
      yield { type: "tool_call_end", id, name: "extension_lookup", arguments: args, partial };
      yield { type: "done" };
      return;
    }
    const toolResult = request.messages.flatMap((message) => Array.isArray(message.content) ? message.content : [])
      .find((part) => part.type === "tool_result");
    expect(toolResult && "content" in toolResult ? toolResult.content : "").toContain("wrapped");
    yield { type: "text_delta", text: "extension complete", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "extension complete" }] } };
    yield { type: "done", response: stopResponse("extension complete") };
  };
  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
    bootstrap: async (registry) => { await registry.loadExtensions([extension]); },
  });
  try {
    const agentId = await simpleAgent(runtime, stream, { idempotencyKey: "agent-extension-assembly" });
    const run = await runtime.start(agentId, "use extension", { idempotencyKey: "run-extension-assembly" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(beforeCalls).toBe(1);
    expect(afterCalls).toBe(1);
    expect(contextMessages).toBeGreaterThan(0);
  } finally {
    await runtime.close();
  }
});

test("AgentRuntime handles are stateless and report missing Runs on first I/O", async () => {
  const runtime = await AgentRuntime.init({ store: new InMemoryStore() });
  try {
    const handle = runtime.run("missing-run" as RunId);
    expect(handle.id).toBe("missing-run" as RunId);
    await expect(handle.snapshot()).rejects.toMatchObject({ code: "run_not_found" });
  } finally {
    await runtime.close();
  }
});

test("AgentRuntime resumes an input-required Run without replaying its original Agent Input", async () => {
  const phases = new Map<string, Phase>([
    ["plan", {
      name: "plan",
      description: "Plan",
      filePath: "<test>",
      baseDir: "<test>",
      content: "Plan",
      isolated: false,
    }],
    ["finish", {
      name: "finish",
      description: "Finish",
      filePath: "<test>",
      baseDir: "<test>",
      content: "Finish",
      isolated: false,
    }],
  ]);
  const requests: Parameters<StreamFn>[0][] = [];
  const stream: StreamFn = async function* (request) {
    requests.push(request);
    const text = "Which target?";
    yield { type: "start", partial: { role: "assistant", contentBlocks: [] } };
    yield { type: "text_delta", text, partial: { role: "assistant", contentBlocks: [{ type: "text", text }] } };
    yield { type: "done", response: { content: text, stopReason: "stop" } };
  };
  const store = new InMemoryStore();
  const runtime = await AgentRuntime.init({ store, concurrency: 1 });
  try {
    const agentId = await createPhaseAgent(runtime, {
      identity: "runtime-input-v1",
      stream,
      phases: { phases, entryPhaseId: "plan" },
      options: { idempotencyKey: "agent-input" },
    });
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "run-input" });
    const first = await run.wait();
    expect(first.type).toBe("input_required");
    if (first.type !== "input_required") return;
    const before = await run.snapshot();
    await run.respond({ requestId: first.requestId, input: "production" });
    const second = await run.wait();
    expect(second.type).toBe("input_required");
    expect(requests[1]?.messages
      .filter(({ role, content }) =>
        role === "user" && (content === "hello" || content === "production"))
      .map(({ content }) => content))
      .toEqual(["hello", "production"]);
    expect((await run.snapshot()).revision).toBeGreaterThan(before.revision);
  } finally {
    await runtime.close();
  }
});

test("input-required Phase survives Runtime restart and remains visible at the public boundary", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rowan-phase-boundary-"));
  const filename = join(directory, "runtime.sqlite");
  const phases = new Map<string, Phase>([["task-planning", {
    name: "task-planning",
    description: "Plan tasks",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Plan tasks",
    isolated: false,
  }], ["task-execution", {
    name: "task-execution",
    description: "Execute tasks",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Execute tasks",
    isolated: false,
  }]]);
  const stream: StreamFn = async function* () {
    const text = "What should we plan?";
    yield { type: "text_delta", text, partial: { role: "assistant", contentBlocks: [{ type: "text", text }] } };
    yield { type: "done", response: { content: text, stopReason: "stop" } };
  };

  try {
    let runId!: RunId;
    const firstStore = new SqliteStore(filename);
    const firstRuntime = await AgentRuntime.init({ store: firstStore, concurrency: 1 });
    try {
      const agentId = await createPhaseAgent(firstRuntime, {
        identity: "phase-boundary-v1",
        stream,
        phases: { phases, entryPhaseId: "task-planning" },
        options: { idempotencyKey: "phase-boundary-agent" },
      });
      const run = await firstRuntime.start(agentId, "hello", { idempotencyKey: "phase-boundary-run" });
      runId = run.id;
      const boundary = await run.wait();
      expect(boundary.type).toBe("input_required");
      if (boundary.type !== "input_required") return;
      expect(boundary.phase).toBe("task-planning");
    } finally {
      await firstRuntime.close();
      firstStore.close();
    }

    const secondStore = new SqliteStore(filename);
    const secondRuntime = await AgentRuntime.init({ store: secondStore, concurrency: 1 });
    try {
      const recovered = secondRuntime.run(runId);
      const snapshot = await recovered.snapshot();
      expect(snapshot.state).toBe("input_required");
      if (snapshot.state !== "input_required") return;
      expect(snapshot.request.phase).toBe("task-planning");
      const boundary = await recovered.wait();
      expect(boundary.type).toBe("input_required");
      if (boundary.type !== "input_required") return;
      expect(boundary.phase).toBe("task-planning");
    } finally {
      await secondRuntime.close();
      secondStore.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Phase callbacks receive the durable Run execution identity", async () => {
  let observed: { agentId: string; runId: string; executionId: string } | undefined;
  const phases = new Map<string, Phase>([["work", {
    name: "work",
    description: "Work",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Work",
    isolated: false,
    run: async (context) => {
      observed = context.execution;
      return { message: "done", route: "stop" };
    },
  }]]);
  const runtime = await AgentRuntime.init({ store: new InMemoryStore() });
  try {
    const agentId = await createPhaseAgent(runtime, {
      identity: "phase-execution-identity",
      stream: async function* () { yield { type: "done", response: { content: "unused", stopReason: "stop" } }; },
      phases: { phases, entryPhaseId: "work" },
      options: { idempotencyKey: "phase-execution-agent" },
    });
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "phase-execution-run" });
    expect((await run.wait()).type).toBe("completed");
    expect(observed).toMatchObject({ agentId, runId: run.id });
    expect(observed?.executionId).toStartWith("exec_");
  } finally {
    await runtime.close();
  }
});

test("AgentRuntime retries the same Event before advancing live delivery", async () => {
  const stream: StreamFn = async function* () {
    yield { type: "text_delta", text: "done", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "done" }] } };
    yield { type: "done", response: stopResponse("done") };
  };
  const controller = new AbortController();
  const runtime = await AgentRuntime.init({ store: new InMemoryStore() });
  try {
    const agentId = await simpleAgent(runtime, stream, { idempotencyKey: "consumer-agent" });
    const attempts: string[] = [];
    let failFirst = true;
    const consumer = await runtime.consume({
      consumerId: "consumer-1",
      signal: controller.signal,
      onEvent: (event) => {
        attempts.push(String(event.id));
        if (failFirst) {
          failFirst = false;
          throw new Error("retry");
        }
      },
    });
    await consumer.caughtUp;
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "consumer-run" });
    await run.wait();
    await new Promise((resolve) => setTimeout(resolve, 80));
    consumer.stop();
    await consumer.done;
    expect(attempts.length).toBeGreaterThan(1);
    expect(attempts[0]).toBe(attempts[1]);
  } finally {
    controller.abort();
    await runtime.close();
  }
});

test("AgentRuntime backs off an idle durable Consumer after catching up", async () => {
  const backing = new InMemoryStore();
  let polls = 0;
  const store: DurableStore = {
    async openOwner(input) {
      const owned = await backing.openOwner(input);
      return new Proxy(owned, {
        get(target, property, receiver) {
          if (property === "listEvents") {
            return async (...args: Parameters<typeof target.listEvents>) => {
              polls += 1;
              return target.listEvents(...args);
            };
          }
          const value = Reflect.get(target, property, receiver) as unknown;
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    },
  };
  const controller = new AbortController();
  const runtime = await AgentRuntime.init({ store });
  try {
    const consumer = await runtime.consume({
      consumerId: "idle-consumer",
      signal: controller.signal,
      onEvent() {},
    });
    await consumer.caughtUp;
    await Bun.sleep(250);
    consumer.stop();
    await consumer.done;
    expect(polls).toBeLessThanOrEqual(5);
  } finally {
    controller.abort();
    await runtime.close();
  }
});

test("AgentRuntime consumer receives Run metadata on terminal durable events", async () => {
  const stream: StreamFn = async function* () {
    yield { type: "text_delta", text: "done", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "done" }] } };
    yield { type: "done", response: stopResponse("done") };
  };
  const controller = new AbortController();
  const runtime = await AgentRuntime.init({ store: new InMemoryStore() });
  try {
    let resolveTerminal!: (event: unknown) => void;
    const terminal = new Promise<unknown>((resolve) => { resolveTerminal = resolve; });
    const consumer = await runtime.consume({
      consumerId: "metadata-consumer",
      signal: controller.signal,
      onEvent(event) {
        if (event.kind === "run_state_changed" && event.to === "completed") resolveTerminal(event);
      },
    });
    await consumer.caughtUp;
    const agentId = await simpleAgent(runtime, stream, { idempotencyKey: "metadata-agent" });
    const run = await runtime.start(agentId, "hello", {
      idempotencyKey: "metadata-run",
      metadata: { kind: "workflow", invocationId: "invocation-1" },
    });
    await run.wait();

    await expect(terminal).resolves.toMatchObject({
      kind: "run_state_changed",
      to: "completed",
      metadata: { kind: "workflow", invocationId: "invocation-1" },
    });
    consumer.stop();
    await consumer.done;
  } finally {
    controller.abort();
    await runtime.close();
  }
});
