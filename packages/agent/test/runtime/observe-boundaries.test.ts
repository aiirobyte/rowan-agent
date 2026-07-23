import { expect, test } from "bun:test";
import type { StreamFn } from "@rowan-agent/models";
import type { Phase } from "../../src/harness/phases/types";
import Type from "typebox";
import {
  AgentRuntime,
  InMemoryStore,
  type AgentConfig,
  type EventCursor,
  type RunEvent,
  type ToolInvocationContext,
} from "../../src";

function config(stream: StreamFn): AgentConfig {
  return {
    identity: "observe-boundaries-v1",
    model: { provider: "test", id: "model" },
    stream,
    context: { systemPrompt: "Test", tools: [], skills: [] },
  };
}

function cursorAfter(cursor: EventCursor): EventCursor {
  const value = String(cursor);
  const separator = value.lastIndexOf(":");
  return `${value.slice(0, separator)}:${Number(value.slice(separator + 1)) + 1}` as EventCursor;
}

test("AgentRun.observe rejects an Event cursor beyond the Store waterline", async () => {
  const stream: StreamFn = async function* () {
    yield {
      type: "text_delta",
      text: "done",
      partial: { role: "assistant", contentBlocks: [{ type: "text", text: "done" }] },
    };
    yield { type: "done", response: { content: "done", stopReason: "stop" } };
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await runtime.createAgent(config(stream), { idempotencyKey: "cursor-agent" });
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "cursor-run" });
    await run.wait();

    const observed: RunEvent[] = [];
    for await (const event of run.observe()) observed.push(event);
    const terminal = observed.find(
      (event): event is Extract<RunEvent, { kind: "run_transitioned" }> =>
        event.kind === "run_transitioned" && ["completed", "failed", "cancelled"].includes(event.to),
    );
    expect(terminal).toBeDefined();

    const iterator = run.observe({ after: cursorAfter(terminal!.cursor) })[Symbol.asyncIterator]();
    await expect(iterator.next()).rejects.toMatchObject({
      code: "invalid_cursor",
      details: { cursorType: "event", reason: "beyond_waterline" },
    });
  } finally {
    await runtime.close();
  }
});

test("AgentRun.observe keeps the next Execution Attempt's deltas across input_required", async () => {
  let releaseFirstAttempt!: () => void;
  const firstAttempt = new Promise<void>((resolve) => { releaseFirstAttempt = resolve; });
  let releaseProbeDelta!: () => void;
  const probeDelta = new Promise<void>((resolve) => { releaseProbeDelta = resolve; });
  let releaseCompletion!: () => void;
  const completion = new Promise<void>((resolve) => { releaseCompletion = resolve; });
  let resolveEarlyDeltaPublished!: () => void;
  const earlyDeltaPublished = new Promise<void>((resolve) => { resolveEarlyDeltaPublished = resolve; });
  let modelCalls = 0;
  const stream: StreamFn = async function* () {
    modelCalls += 1;
    if (modelCalls === 1) {
      await firstAttempt;
      const text = "Which target?";
      yield {
        type: "text_delta",
        text,
        partial: { role: "assistant", contentBlocks: [{ type: "text", text }] },
      };
      yield { type: "done", response: { content: text, stopReason: "stop" } };
      return;
    }

    yield {
      type: "text_delta",
      text: "early",
      partial: { role: "assistant", contentBlocks: [{ type: "text", text: "early" }] },
    };
    resolveEarlyDeltaPublished();
    await probeDelta;
    const routeArguments = JSON.stringify({ decision: [{ phase: "stop" }] });
    const partial = {
      role: "assistant" as const,
      contentBlocks: [
        { type: "text" as const, text: "earlylate" },
        { type: "tool_call" as const, id: "route-next", name: "route", args: routeArguments },
      ],
    };
    yield { type: "text_delta", text: "late", partial };
    yield { type: "tool_call_start", id: "route-next", name: "route", partial };
    yield { type: "tool_call_end", id: "route-next", name: "route", arguments: routeArguments, partial };
    await completion;
    yield { type: "done" };
  };
  const phases = new Map<string, Phase>([
    ["plan", {
      name: "plan",
      description: "Plan",
      filePath: "<test>",
      baseDir: "<test>",
      content: "Plan",
      isolated: false,
    }],
    ["unused", {
      name: "unused",
      description: "Unused",
      filePath: "<test>",
      baseDir: "<test>",
      content: "Unused",
      isolated: false,
    }],
  ]);
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await runtime.createAgent({
      ...config(stream),
      context: {
        systemPrompt: "Test",
        tools: [],
        skills: [],
        phases: { phases, entryPhaseId: "plan" },
      },
    }, { idempotencyKey: "attempt-agent" });
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "attempt-run" });
    const iterator = run.observe()[Symbol.asyncIterator]();

    const firstRunning = await nextMatching(
      iterator,
      (event) => event.kind === "run_transitioned" && event.to === "running",
    );
    expect(firstRunning.kind).toBe("run_transitioned");
    releaseFirstAttempt();
    const boundary = await run.wait();
    expect(boundary.type).toBe("input_required");
    if (boundary.type !== "input_required") return;

    const promptCommitted = await nextMatching(
      iterator,
      (event) => event.kind === "message_committed"
        && event.message.role === "assistant"
        && event.message.content === "Which target?",
    );
    expect(promptCommitted.kind).toBe("message_committed");

    await run.respond({ requestId: boundary.requestId, input: "production" });
    await earlyDeltaPublished;
    const inputRequired = await iterator.next();
    expect(inputRequired.value).toMatchObject({ kind: "run_transitioned", to: "input_required" });

    const nextEvent = iterator.next();
    releaseProbeDelta();
    const observed = await nextEvent;
    expect(observed.done).toBe(false);
    expect(observed.value).toMatchObject({
      kind: "message_delta",
      text: expect.stringContaining("early"),
    });

    releaseCompletion();
    await run.wait();
    const remaining: RunEvent[] = [];
    for await (const event of { [Symbol.asyncIterator]: () => iterator }) remaining.push(event);
    expect(remaining.at(-1)).toMatchObject({ kind: "run_transitioned", to: "completed" });
  } finally {
    releaseFirstAttempt();
    releaseProbeDelta();
    releaseCompletion();
    await runtime.close();
  }
});

test("Tool progress reporter retained after Tool terminal state is inert", async () => {
  let releaseToolRequest!: () => void;
  const toolRequest = new Promise<void>((resolve) => { releaseToolRequest = resolve; });
  let releaseTool!: () => void;
  const toolCompletion = new Promise<void>((resolve) => { releaseTool = resolve; });
  let releaseFinalModel!: () => void;
  const finalModel = new Promise<void>((resolve) => { releaseFinalModel = resolve; });
  let resolveSecondModelStarted!: () => void;
  const secondModelStarted = new Promise<void>((resolve) => { resolveSecondModelStarted = resolve; });
  let retainedReporter: ToolInvocationContext["reportProgress"] | undefined;
  let modelCalls = 0;
  const stream: StreamFn = async function* () {
    modelCalls += 1;
    if (modelCalls === 1) {
      await toolRequest;
      const partial = {
        role: "assistant" as const,
        contentBlocks: [{ type: "tool_call" as const, id: "lookup-call", name: "lookup", args: "{}" }],
      };
      yield { type: "tool_call_start", id: "lookup-call", name: "lookup", partial };
      yield { type: "tool_call_end", id: "lookup-call", name: "lookup", arguments: "{}", partial };
      yield { type: "done" };
      return;
    }
    resolveSecondModelStarted();
    await finalModel;
    yield {
      type: "text_delta",
      text: "done",
      partial: { role: "assistant", contentBlocks: [{ type: "text", text: "done" }] },
    };
    yield { type: "done", response: { content: "done", stopReason: "stop" } };
  };
  const tool = {
    name: "lookup",
    description: "Look up a value.",
    parameters: Type.Object({}),
    async execute(_args: unknown, context: ToolInvocationContext) {
      retainedReporter = context.reportProgress;
      context.reportProgress({ stage: "active" });
      await toolCompletion;
      return { ok: true as const, content: { value: 42 } };
    },
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await runtime.createAgent({
      ...config(stream),
      context: { systemPrompt: "Test", tools: [tool], skills: [] },
    }, { idempotencyKey: "reporter-agent" });
    const run = await runtime.start(agentId, "use lookup", { idempotencyKey: "reporter-run" });
    const iterator = run.observe()[Symbol.asyncIterator]();

    await nextMatching(iterator, (event) => event.kind === "run_transitioned" && event.to === "running");
    releaseToolRequest();
    const activeProgress = await nextMatching(iterator, (event) => event.kind === "tool_progress");
    expect(activeProgress).toMatchObject({ kind: "tool_progress", progress: { stage: "active" } });
    releaseTool();
    await nextMatching(
      iterator,
      (event) => event.kind === "tool_state_changed" && ["completed", "failed", "indeterminate"].includes(event.transition.to),
    );
    await secondModelStarted;

    retainedReporter?.({ stage: "late" });
    releaseFinalModel();
    await run.wait();
    const remaining: RunEvent[] = [];
    for await (const event of { [Symbol.asyncIterator]: () => iterator }) remaining.push(event);

    expect(remaining.some(
      (event) => event.kind === "tool_progress"
        && typeof event.progress === "object"
        && event.progress !== null
        && !Array.isArray(event.progress)
        && (event.progress as Readonly<Record<string, unknown>>).stage === "late",
    )).toBe(false);
    expect(remaining.at(-1)).toMatchObject({ kind: "run_transitioned", to: "completed" });
  } finally {
    releaseToolRequest();
    releaseTool();
    releaseFinalModel();
    await runtime.close();
  }
});

test("a slow AgentRun observer does not backpressure execution and terminal is last", async () => {
  let releaseDeltas!: () => void;
  const deltas = new Promise<void>((resolve) => { releaseDeltas = resolve; });
  let resolveAllDeltasPublished!: () => void;
  const allDeltasPublished = new Promise<void>((resolve) => { resolveAllDeltasPublished = resolve; });
  let releaseCompletion!: () => void;
  const completion = new Promise<void>((resolve) => { releaseCompletion = resolve; });
  const output = "x".repeat(256);
  const stream: StreamFn = async function* () {
    await deltas;
    for (let index = 0; index < output.length; index += 1) {
      const text = output.slice(0, index + 1);
      yield {
        type: "text_delta",
        text: "x",
        partial: { role: "assistant", contentBlocks: [{ type: "text", text }] },
      };
    }
    resolveAllDeltasPublished();
    await completion;
    yield { type: "done", response: { content: output, stopReason: "stop" } };
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await runtime.createAgent(config(stream), { idempotencyKey: "slow-agent" });
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "slow-run" });
    const iterator = run.observe()[Symbol.asyncIterator]();

    await nextMatching(iterator, (event) => event.kind === "run_transitioned" && event.to === "running");
    const firstTransient = iterator.next();
    releaseDeltas();
    await expect(firstTransient).resolves.toMatchObject({
      done: false,
      value: { kind: "message_delta" },
    });

    const modelWasNotBackpressured = await Promise.race([
      allDeltasPublished.then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 250)),
    ]);
    expect(modelWasNotBackpressured).toBe(true);
    releaseCompletion();
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });

    const remaining: RunEvent[] = [];
    for await (const event of { [Symbol.asyncIterator]: () => iterator }) remaining.push(event);
    expect(remaining.at(-1)).toMatchObject({ kind: "run_transitioned", to: "completed" });
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
  } finally {
    releaseDeltas();
    releaseCompletion();
    await runtime.close();
  }
});

async function nextMatching(
  iterator: AsyncIterator<RunEvent>,
  predicate: (event: RunEvent) => boolean,
): Promise<RunEvent> {
  while (true) {
    const next = await iterator.next();
    if (next.done) throw new Error("Run observation ended before the expected event.");
    if (predicate(next.value)) return next.value;
  }
}
