import { expect, test } from "bun:test";
import { AgentRuntime, InMemoryRuntimeStateStore, createMessage } from "../../src";
import type { RuntimeEvent } from "../../src";
import { InMemorySessionManager } from "../../src/harness/session";
import type { SessionManagerProvider } from "../../src/harness/session/session-manager";
import type { CreateSessionManagerInput, SessionManager } from "../../src/harness/session/session-manager";
import { createTestContext } from "../support/agent-run";
import { scriptedStream } from "../support/scripted-stream";

type TestSessionProvider = SessionManagerProvider & {
  get(sessionId: string): InMemorySessionManager | undefined;
};

function createSessionProvider(): TestSessionProvider {
  const sessions = new Map<string, InMemorySessionManager>();
  return {
    async create(input: CreateSessionManagerInput): Promise<SessionManager> {
      const manager = InMemorySessionManager.create(input);
      sessions.set(manager.getSessionId(), manager);
      return manager;
    },
    async open(sessionId: string): Promise<SessionManager | undefined> {
      return sessions.get(sessionId);
    },
    async list() { return []; },
    async delete(sessionId: string) { return sessions.delete(sessionId); },
    get(sessionId: string): InMemorySessionManager | undefined {
      return sessions.get(sessionId);
    },
  };
}

function agentOptions() {
  return {
    context: createTestContext({ systemPrompt: "Current system prompt" }),
    model: { provider: "test", id: "scripted" },
    stream: scriptedStream,
  };
}

test("Runtime creates and binds durable Agent and Session records", async () => {
  const stateStore = new InMemoryRuntimeStateStore();
  const sessionManager = createSessionProvider();
  const runtime = await AgentRuntime.start({ stateStore, sessionProvider: sessionManager });

  try {
    const agent = await runtime.createAgent(agentOptions());
    expect(agent.id).toMatch(/^agt_/);
    expect(agent.sessionId).toMatch(/^ses_/);

    const record = await stateStore.getAgent(agent.id);
    expect(record).toMatchObject({ id: agent.id, sessionId: agent.sessionId, state: "active" });

    await (await agent.send("run")).result();
    const entries = await sessionManager.get(agent.sessionId)!.listEntries();
    expect(entries.some((entry) => entry.type === "outcome")).toBe(true);
  } finally {
    await runtime.stop();
  }
});

test("Runtime reconstructs the same Agent and Session IDs with current Context", async () => {
  const stateStore = new InMemoryRuntimeStateStore();
  const sessionManager = createSessionProvider();
  const runtime = await AgentRuntime.start({ stateStore, sessionProvider: sessionManager });
  let restarted: AgentRuntime | undefined;

  try {
    const created = await runtime.createAgent(agentOptions());
    const agentId = created.id;
    const sessionId = created.sessionId;
    await runtime.stop();

    restarted = await AgentRuntime.start({ stateStore, sessionProvider: sessionManager });
    const resumed = await restarted.reconstructAgent(agentId, {
      ...agentOptions(),
      context: createTestContext({ systemPrompt: "Updated system prompt" }),
    });

    expect(resumed.id).toBe(agentId);
    expect(resumed.sessionId).toBe(sessionId);
    await restarted.stop();
  } finally {
    await restarted?.stop();
    await runtime.stop();
  }
});

test("Runtime reconstruction rejects a duplicate live binding", async () => {
  const stateStore = new InMemoryRuntimeStateStore();
  const sessionManager = createSessionProvider();
  const runtime = await AgentRuntime.start({ stateStore, sessionProvider: sessionManager });

  try {
    const created = await runtime.createAgent(agentOptions());
    await expect(runtime.reconstructAgent(created.id, agentOptions()))
      .rejects.toThrow("already bound");
  } finally {
    await runtime.stop();
  }
});

test("Agent.send persists a Run before returning and resolves through AgentRun", async () => {
  const stateStore = new InMemoryRuntimeStateStore();
  const runtime = await AgentRuntime.start({ stateStore, sessionProvider: createSessionProvider() });

  try {
    const agent = await runtime.createAgent(agentOptions());
    const run = await agent.send("continue");
    expect(["queued", "running", "completed"]).toContain(run.status);

    const outcome = await run.result();
    expect(outcome.message).toContain("Direct response");
    expect(run.status).toBe("completed");

    const persisted = await runtime.getRun(run.id);
    expect(persisted).toMatchObject({ id: run.id, state: "completed", outcome: { message: outcome.message } });
  } finally {
    await runtime.stop();
  }
});

test("AgentRuntime reads a persisted Runtime Message by Event message ID", async () => {
  const runtime = await AgentRuntime.start({
    stateStore: new InMemoryRuntimeStateStore(),
    sessionProvider: createSessionProvider(),
  });

  try {
    const agent = await runtime.createAgent(agentOptions());
    const input = createMessage("user", "run workflow", {
      kind: "everyield.workflow-run",
      projectId: "project-1",
      taskId: "task-1",
      workflowId: "workflow-1",
      attempt: 2,
    });
    const run = await agent.send(input);
    const event = (await runtime.listEvents())
      .find((candidate) => candidate.kind === "run_enqueued" && candidate.runId === run.id);
    if (!event?.messageId) throw new Error("Expected run_enqueued Event with a Message ID.");

    expect(await runtime.getMessage(event.messageId)).toMatchObject({
      id: event.messageId,
      agentId: agent.id,
      runId: run.id,
      input,
    });
  } finally {
    await runtime.stop();
  }
});

test("AgentRuntime exposes a catch-up handle for durable Event consumers", async () => {
  const runtime = await AgentRuntime.start({
    stateStore: new InMemoryRuntimeStateStore(),
    sessionProvider: createSessionProvider(),
  });
  try {
    const agent = await runtime.createAgent(agentOptions());
    const run = await agent.send(createMessage("user", "catch up", {
      kind: "everyield.workflow-run",
      teamId: "team-1",
    }));
    const events: RuntimeEvent[] = [];
    const consumer = runtime.consumeEvents("catch-up-barrier", (event) => {
      events.push(event);
    });
    await consumer.caughtUp;
    expect(events.some((event) => event.kind === "run_enqueued" && event.runId === run.id)).toBe(true);
    consumer.stop();
  } finally {
    await runtime.stop();
  }
});

test("AgentRuntime lists historical Runs in stable createdAt and id order", async () => {
  const runtime = await AgentRuntime.start({
    stateStore: new InMemoryRuntimeStateStore(),
    sessionProvider: createSessionProvider(),
  });
  try {
    const agent = await runtime.createAgent(agentOptions());
    const first = await agent.send("first");
    const second = await agent.send("second");
    await first.result();
    await second.result();
    const runs = await runtime.listRuns({ agentId: agent.id });
    expect(runs).toEqual([...runs].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || String(a.id).localeCompare(String(b.id))));
    expect(await runtime.listRuns({ states: ["completed"] })).toHaveLength(2);
  } finally {
    await runtime.stop();
  }
});

test("stopping a consumer before catch-up rejects its barrier with AbortError", async () => {
  const runtime = await AgentRuntime.start({
    stateStore: new InMemoryRuntimeStateStore(),
    sessionProvider: createSessionProvider(),
  });
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  try {
    const agent = await runtime.createAgent(agentOptions());
    await agent.send("blocked consumer");
    const consumer = runtime.consumeEvents("abort-before-catch-up", async () => {
      entered();
      await blocked;
    });
    await started;
    consumer.stop();
    await expect(consumer.caughtUp).rejects.toMatchObject({ name: "AbortError" });
    release();
  } finally {
    release?.();
    await runtime.stop();
  }
});

test("AgentRun runtime event consumers return the same catch-up handle", async () => {
  const runtime = await AgentRuntime.start({
    stateStore: new InMemoryRuntimeStateStore(),
    sessionProvider: createSessionProvider(),
  });
  try {
    const agent = await runtime.createAgent(agentOptions());
    const run = await agent.send("run-specific events");
    const events: RuntimeEvent[] = [];
    const consumer = run.consumeRuntimeEvents("run-specific-consumer", (event) => {
      events.push(event);
    });
    await consumer.caughtUp;
    expect(events.every((event) => event.runId === run.id)).toBe(true);
    consumer.stop();
  } finally {
    await runtime.stop();
  }
});

test("Runtime Scheduler serializes one Agent and runs different Agents concurrently", async () => {
  let active = 0;
  let peak = 0;
  const delayedStream: typeof scriptedStream = async function* (request, options) {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 15));
    try {
      yield* scriptedStream(request, options);
    } finally {
      active -= 1;
    }
  };
  const stateStore = new InMemoryRuntimeStateStore();
  const runtime = await AgentRuntime.start({
    stateStore,
    sessionProvider: createSessionProvider(),
    maxConcurrentRuns: 2,
  });

  try {
    const first = await runtime.createAgent({ ...agentOptions(), stream: delayedStream });
    const second = await runtime.createAgent({ ...agentOptions(), stream: delayedStream });
    const firstRun = await first.send("first");
    const secondRun = await second.send("second");
    await Promise.all([firstRun.result(), secondRun.result()]);
    expect(peak).toBe(2);

    peak = 0;
    const sameAgentFirst = await first.send("third");
    const sameAgentSecond = await first.send("fourth");
    await Promise.all([sameAgentFirst.result(), sameAgentSecond.result()]);
    expect(peak).toBe(1);
  } finally {
    await runtime.stop();
  }
});
