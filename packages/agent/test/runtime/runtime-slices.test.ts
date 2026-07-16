import { expect, test } from "bun:test";
import {
  Agent,
  AgentRuntime,
  InMemoryRuntimeStateStore,
  asFactoryId,
  createMessage,
  type AgentContext,
  type AgentEvent,
  type RuntimeEvent,
  ToolRuntime,
} from "../../src";
import Type from "typebox";
import { InMemorySessionManager } from "../../src/harness/session";
import type { CreateSessionManagerInput, SessionManager } from "../../src/harness/session/session-manager";
import type { RuntimeSessionManagerProvider } from "../../src/runtime";
import { createTestContext } from "../support/agent-run";
import { yieldRouteToolCall } from "../support/scripted-stream";

type TestProvider = RuntimeSessionManagerProvider & { get(id: string): SessionManager | undefined };

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
  factoryId?: string;
  onOutcome?: (outcome: import("../../src").Outcome) => Promise<void>;
} = {}) {
  return {
    context: input.context ?? createTestContext(),
    model: { provider: "test", id: "scripted" },
    stream: input.stream ?? (async function* () {
      yield { type: "text_delta", text: "done", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "done" }] } };
      yield { type: "done" };
    }),
    ...(input.factoryId ? { factoryId: asFactoryId(input.factoryId) } : {}),
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
  const runtime = await AgentRuntime.start({ stateStore, sessionManager });
  const unsubscribe = runtime.subscribeEvents((event) => { events.push(event); });
  try {
    const agent = await Agent.create(options({ stream, context: {
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
    await runtime.pauseAgent(agent.getAgentId()!);
    await runtime.resumeAgent(agent.getAgentId()!);
    const second = await agent.send("continue");
    expect(second.id).toBe(first.id);
    await second.result();
    expect(events.map((event) => event.kind)).toEqual(expect.arrayContaining(["run_suspended", "agent_paused", "agent_resumed"]));
  } finally {
    unsubscribe();
    await runtime.stop();
  }
});

test("Runtime restart reconstructs unfinished Agents through opaque Factory IDs", async () => {
  const stateStore = new InMemoryRuntimeStateStore();
  const sessionManager = provider();
  const factoryId = asFactoryId("factory_current");
  const outcomes: string[] = [];
  const runtime = await AgentRuntime.start({ stateStore, sessionManager });
  let agentId: import("../../src").AgentId;
  let sessionId: string;
  try {
    const agent = await Agent.create(options({ factoryId: "factory_current", onOutcome: async (outcome) => { outcomes.push(outcome.message); } }));
    agentId = agent.getAgentId()!;
    sessionId = agent.getSessionId()!;
  } finally {
    await runtime.stop();
  }

  await stateStore.enqueueAgentInput({ agentId: agentId!, input: createMessage("user", "recover me") });
  const restarted = await AgentRuntime.start({
    stateStore,
    sessionManager,
    factories: new Map([[factoryId, async () => options({ onOutcome: async (outcome) => { outcomes.push(outcome.message); } })]]),
  });
  try {
    await waitFor(async () => outcomes.length > 0);
    expect(await stateStore.getAgent(agentId!)).toMatchObject({ sessionId, factoryId, state: "active" });
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
  await waitFor(async () => (await stateStore.listEvents()).filter((event) => event.kind === "tool_call_started").length >= 2);
  controller.abort();
  releaseTool?.();
  const interrupted = await pending;
  expect(interrupted.ok).toBe(false);
  const toolCalls = (await stateStore.listEvents()).filter((event) => event.kind === "tool_call_indeterminate");
  expect(toolCalls).toHaveLength(1);
});
