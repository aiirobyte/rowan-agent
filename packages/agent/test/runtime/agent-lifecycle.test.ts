import { expect, test } from "bun:test";
import { AgentRuntime, InMemoryRuntimeStateStore, createMessage } from "../../src";
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
