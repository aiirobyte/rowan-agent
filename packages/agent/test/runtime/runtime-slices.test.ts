import { expect, test } from "bun:test";
import {
  AgentRuntime,
  InMemoryRuntimeStateStore,
  createMessage,
  type AgentContext,
  type AgentEvent,
  type RuntimeEvent,
} from "../../src";
import Type from "typebox";
import { InMemorySessionManager } from "../../src/harness/session";
import type { CreateSessionManagerInput, SessionManager } from "../../src/harness/session/session-manager";
import type { SessionManagerProvider } from "../../src/harness/session/session-manager";
import { createTestContext } from "../support/agent-run";
import { yieldRouteToolCall } from "../support/scripted-stream";
import { ToolRuntime } from "../../src/runtime/tool-runtime";

type TestProvider = SessionManagerProvider & { get(id: string): SessionManager | undefined };

function provider(): TestProvider {
  const sessions = new Map<string, SessionManager>();
  return {
    async create(input: CreateSessionManagerInput) {
      const manager = InMemorySessionManager.create(input);
      sessions.set(manager.getSessionId(), manager);
      return manager;
    },
    async open(id: string) {
      return sessions.get(id);
    },
    get(id: string) {
      return sessions.get(id);
    },
  };
}

function options(input: {
  context?: AgentContext;
  stream?: AgentContext["messages"] extends never ? never : import("../../src").StreamFn;
  onOutcome?: (outcome: import("../../src").Outcome) => Promise<void>;
} = {}) {
  return {
    context: input.context ?? createTestContext(),
    model: { provider: "test", id: "scripted" },
    stream: input.stream ?? (async function* () {
      yield { type: "text_delta", text: "done", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "done" }] } };
      yield { type: "done" };
    }),
    ...(input.onOutcome ? { onOutcome: input.onOutcome } : {}),
  };
}

async function waitFor(check: () => Promise<boolean>, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for Runtime state.");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test("suspended Agent Input resumes the same Run and Runtime Commands are durable", async () => {
  const stateStore = new InMemoryRuntimeStateStore();
  const sessionManager = provider();
  const events: RuntimeEvent[] = [];
  const stream: import("../../src").StreamFn = async function* (request) {
    if (request.messages.filter((message) => message.role === "user").length < 2) {
      yield { type: "text_delta", text: "waiting", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "waiting" }] } };
      yield { type: "done" };
      return;
    }
    yield* yieldRouteToolCall("stop");
    yield { type: "done" };
  };
  const runtime = await AgentRuntime.start({ stateStore, sessionProvider: sessionManager });
  const unsubscribe = runtime.consumeEvents("runtime-slices", (event) => { events.push(event); });
  try {
    const agent = await runtime.createAgent(options({ stream, context: {
      ...createTestContext(),
      phases: {
        phases: new Map([
          ["plan", { id: "plan", name: "Plan", description: "Plan", filePath: "test", baseDir: "test", content: "" }],
          ["verify", { id: "verify", name: "Verify", description: "Verify", filePath: "test", baseDir: "test", content: "" }],
        ]),
        entryPhaseId: "plan",
      },
    } }));
    const first = await agent.send("need input");
    await waitFor(async () => (await stateStore.getRun(first.id))?.state === "suspended");
    await runtime.pauseAgent(agent.id);
    await runtime.resumeAgent(agent.id);
    const second = await agent.send("continue");
    expect(second.id).toBe(first.id);
    await second.result();
    expect(events.map((event) => event.kind)).toEqual(expect.arrayContaining(["run_suspended", "agent_paused", "agent_resumed"]));
  } finally {
    unsubscribe();
    await runtime.stop();
  }
});

test("Runtime waits for host reconstruction before running recovered work", async () => {
  const stateStore = new InMemoryRuntimeStateStore();
  const sessionManager = provider();
  const outcomes: string[] = [];
  const firstRuntime = await AgentRuntime.start({ stateStore, sessionProvider: sessionManager });
  const agent = await firstRuntime.createAgent(options());
  await firstRuntime.stop();
  const enqueued = await stateStore.enqueueAgentInput({ agentId: agent.id, input: createMessage("user", "recover me") });
  const restarted = await AgentRuntime.start({ stateStore, sessionProvider: sessionManager });
  try {
    expect(await stateStore.getRun(enqueued.run.id)).toMatchObject({ state: "queued" });

    await restarted.reconstructAgent(agent.id, options({
      onOutcome: async (outcome) => { outcomes.push(outcome.message); },
    }));
    await waitFor(async () => outcomes.length > 0);
    expect(await stateStore.getRun(enqueued.run.id)).toMatchObject({ state: "completed" });
  } finally {
    await restarted.stop();
  }
});

test("reconstructed queued input is included in the model request once", async () => {
  const stateStore = new InMemoryRuntimeStateStore();
  const sessionManager = provider();
  const firstRuntime = await AgentRuntime.start({ stateStore, sessionProvider: sessionManager });
  const agent = await firstRuntime.createAgent(options());
  const input = createMessage("user", "already persisted");
  await sessionManager.get(agent.sessionId)!.appendMessage(input);
  await firstRuntime.stop();
  const enqueued = await stateStore.enqueueAgentInput({ agentId: agent.id, input });
  const requests: Parameters<import("../../src").StreamFn>[0][] = [];
  const restarted = await AgentRuntime.start({ stateStore, sessionProvider: sessionManager });
  try {
    await restarted.reconstructAgent(agent.id, options({
      stream: async function* (request) {
        requests.push(request);
        yield { type: "text_delta", text: "done", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "done" }] } };
        yield { type: "done" };
      },
    }));
    await waitFor(async () => (await stateStore.getRun(enqueued.run.id))?.state === "completed");
    expect(requests).toHaveLength(1);
    expect(requests[0]!.messages.filter((message) => (
      message.role === "user" && message.content === "already persisted"
    ))).toHaveLength(1);
  } finally {
    await restarted.stop();
  }
});

test("reconstructed suspended input resumes from the persisted phase", async () => {
  const stateStore = new InMemoryRuntimeStateStore();
  const sessionManager = provider();
  const phases = {
    phases: new Map([
      ["plan", { id: "plan", name: "Plan", description: "Plan", filePath: "test", baseDir: "test", content: "" }],
      ["verify", { id: "verify", name: "Verify", description: "Verify", filePath: "test", baseDir: "test", content: "" }],
    ]),
    entryPhaseId: "plan",
  };
  const context = { ...createTestContext(), phases };
  const waitingStream: import("../../src").StreamFn = async function* () {
    yield { type: "text_delta", text: "waiting", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "waiting" }] } };
    yield { type: "done" };
  };
  const firstRuntime = await AgentRuntime.start({ stateStore, sessionProvider: sessionManager });
  const agent = await firstRuntime.createAgent(options({ context, stream: waitingStream }));
  const first = await agent.send("need input");
  await waitFor(async () => (await stateStore.getRun(first.id))?.state === "suspended");
  await firstRuntime.stop();
  const outcomes: string[] = [];
  const restarted = await AgentRuntime.start({ stateStore, sessionProvider: sessionManager });
  try {
    const reconstructed = await restarted.reconstructAgent(agent.id, options({
      context,
      onOutcome: async (outcome) => { outcomes.push(outcome.message); },
      stream: async function* (request) {
        yield* yieldRouteToolCall("stop");
        yield { type: "done" };
      },
    }));
    const resumed = await reconstructed.send("continue");
    expect(resumed.id).toBe(first.id);
    await waitFor(async () => (await stateStore.getRun(first.id))?.state === "completed");
    expect(outcomes).toEqual(["Plan phase completed."]);
  } finally {
    await restarted.stop();
  }
});

test("Tool Runtime narrows capabilities, enforces concurrency, and records indeterminate aborts", async () => {
  const stateStore = new InMemoryRuntimeStateStore();
  const agent = await stateStore.createAgent({ sessionId: "session-tools" });
  const enqueued = await stateStore.enqueueAgentInput({ agentId: agent.id, input: createMessage("user", "tools") });
  const leased = await stateStore.leaseRun({ runId: enqueued.run.id, workerId: "test", leaseDurationMs: 10_000 });
  let releaseTool!: () => void;
  const blockedTool = {
    name: "blocked",
    description: "blocked",
    parameters: Type.Object({}),
    execute: async () => ({ toolCallId: "blocked", toolName: "blocked", ok: true, content: "no" }),
  };
  const slowTool = {
    name: "slow",
    description: "slow",
    parameters: Type.Object({}),
    execute: async (_args: unknown, _context: unknown, signal?: AbortSignal) => {
      await new Promise<void>((resolve) => {
        releaseTool = resolve;
        signal?.addEventListener("abort", () => resolve(), { once: true });
      });
      return { toolCallId: "slow", toolName: "slow", ok: true, content: "done" };
    },
  };
  const runtime = new ToolRuntime(stateStore, { allowedTools: ["slow"], maxConcurrent: 1 });
  const denied = await runtime.execute({
    agentId: agent.id,
    runId: leased.run.id,
    tool: blockedTool,
    toolCall: { id: "blocked", name: "blocked", args: {} },
    context: { skills: [] },
  });
  expect(denied.ok).toBe(false);
  const controller = new AbortController();
  const pending = runtime.execute({
    agentId: agent.id,
    runId: leased.run.id,
    tool: slowTool,
    toolCall: { id: "slow", name: "slow", args: {} },
    context: { skills: [] },
    signal: controller.signal,
  });
  await waitFor(async () => (await stateStore.listEvents()).filter((event) => event.kind === "tool_call_started").length >= 1);
  controller.abort();
  releaseTool?.();
  const interrupted = await pending;
  expect(interrupted.ok).toBe(false);
  const toolCalls = (await stateStore.listEvents()).filter((event) => event.kind === "tool_call_indeterminate");
  expect(toolCalls).toHaveLength(1);
});

test("Tool Runtime reserves capacity before waking more queued Tool Calls", async () => {
  const stateStore = new InMemoryRuntimeStateStore();
  const agent = await stateStore.createAgent({ sessionId: "session-tool-capacity" });
  const enqueued = await stateStore.enqueueAgentInput({ agentId: agent.id, input: createMessage("user", "tools") });
  const leased = await stateStore.leaseRun({ runId: enqueued.run.id, workerId: "test", leaseDurationMs: 10_000 });
  let releaseFirst!: () => void;
  let releaseRemaining!: () => void;
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const remainingGate = new Promise<void>((resolve) => { releaseRemaining = resolve; });
  let invocations = 0;
  let active = 0;
  let peak = 0;
  const tool = {
    name: "serial",
    description: "serial",
    parameters: Type.Object({}),
    execute: async () => {
      const invocation = ++invocations;
      active += 1;
      peak = Math.max(peak, active);
      await (invocation === 1 ? firstGate : remainingGate);
      active -= 1;
      return { toolCallId: `serial-${invocation}`, toolName: "serial", ok: true, content: "done" };
    },
  };
  const runtime = new ToolRuntime(stateStore, { maxConcurrent: 1 });
  const execute = (id: string) => runtime.execute({
    agentId: agent.id,
    runId: leased.run.id,
    tool,
    toolCall: { id, name: "serial", args: {} },
    context: { skills: [] },
  });

  const first = execute("serial-1");
  await waitFor(() => Promise.resolve(invocations === 1));
  const second = execute("serial-2");
  const third = execute("serial-3");
  releaseFirst();
  await waitFor(() => Promise.resolve(invocations >= 2));
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(peak).toBe(1);
  releaseRemaining();
  await Promise.all([first, second, third]);
});

test("Tool Runtime fails an aborted queued Tool Call without marking it indeterminate", async () => {
  const stateStore = new InMemoryRuntimeStateStore();
  const agent = await stateStore.createAgent({ sessionId: "session-tool-abort" });
  const enqueued = await stateStore.enqueueAgentInput({ agentId: agent.id, input: createMessage("user", "tools") });
  const leased = await stateStore.leaseRun({ runId: enqueued.run.id, workerId: "test", leaseDurationMs: 10_000 });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const tool = {
    name: "serial",
    description: "serial",
    parameters: Type.Object({}),
    execute: async () => {
      await gate;
      return { toolCallId: "serial", toolName: "serial", ok: true, content: "done" };
    },
  };
  const runtime = new ToolRuntime(stateStore, { maxConcurrent: 1 });
  const first = runtime.execute({
    agentId: agent.id,
    runId: leased.run.id,
    tool,
    toolCall: { id: "running", name: "serial", args: {} },
    context: { skills: [] },
  });
  await waitFor(async () => (await stateStore.listEvents()).some((event) => event.kind === "tool_call_started"));
  const controller = new AbortController();
  const queued = runtime.execute({
    agentId: agent.id,
    runId: leased.run.id,
    tool,
    toolCall: { id: "queued", name: "serial", args: {} },
    context: { skills: [] },
    signal: controller.signal,
  });
  await waitFor(async () => (await stateStore.listEvents()).filter((event) => event.kind === "tool_call_created").length === 2);
  controller.abort();
  const result = await queued;
  release();
  await first;

  const created = (await stateStore.listEvents()).filter((event) => event.kind === "tool_call_created");
  const queuedCall = await stateStore.getToolCall(created[1]!.toolCallId!);
  expect(result.ok).toBe(false);
  expect(queuedCall?.state).toBe("failed");
  expect((await stateStore.listEvents()).filter((event) => event.kind === "tool_call_indeterminate")).toHaveLength(0);
});
