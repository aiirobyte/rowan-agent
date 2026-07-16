import { expect, test } from "bun:test";
import { Agent, AgentRuntime, InMemoryRuntimeStateStore } from "../../src";
import { InMemorySessionManager } from "../../src/harness/session";
import type { RuntimeSessionManagerProvider } from "../../src/runtime";
import type { CreateSessionManagerInput, SessionManager } from "../../src/harness/session/session-manager";
import { createTestContext } from "../support/agent-run";
import { scriptedStream } from "../support/scripted-stream";

type TestSessionProvider = RuntimeSessionManagerProvider & {
  get(sessionId: string): SessionManager | undefined;
};

function createSessionProvider(): TestSessionProvider {
  const sessions = new Map<string, SessionManager>();
  return {
    async create(input: CreateSessionManagerInput): Promise<SessionManager> {
      const manager = InMemorySessionManager.create(input);
      sessions.set(manager.getSessionId(), manager);
      return manager;
    },
    async open(sessionId: string): Promise<SessionManager | undefined> {
      return sessions.get(sessionId);
    },
    get(sessionId: string): SessionManager | undefined {
      return sessions.get(sessionId);
    },
  };
}

function agentOptions(input?: string) {
  return {
    context: createTestContext({ systemPrompt: "Current system prompt" }),
    model: { provider: "test", id: "scripted" },
    stream: scriptedStream,
    ...(input !== undefined ? { input } : {}),
  };
}

test("Agent.create creates and binds durable Agent and Session records", async () => {
  const stateStore = new InMemoryRuntimeStateStore();
  const sessionManager = createSessionProvider();
  const runtime = await AgentRuntime.start({ stateStore, sessionManager });

  try {
    const agent = await Agent.create(agentOptions("hello"));
    expect(agent.getAgentId()).toMatch(/^agt_/);
    expect(agent.getSessionId()).toMatch(/^ses_/);

    const record = await stateStore.getAgent(agent.getAgentId()!);
    expect(record).toMatchObject({ id: agent.getAgentId(), sessionId: agent.getSessionId(), state: "active" });

    await agent.run();
    const entries = await sessionManager.get(agent.getSessionId()!)!.listEntries();
    expect(entries.some((entry) => entry.type === "outcome")).toBe(true);
  } finally {
    await runtime.stop();
  }
});

test("Agent.resume restores the same Agent and Session IDs with current Context", async () => {
  const stateStore = new InMemoryRuntimeStateStore();
  const sessionManager = createSessionProvider();
  const runtime = await AgentRuntime.start({ stateStore, sessionManager });

  try {
    const created = await Agent.create(agentOptions("hello"));
    const agentId = created.getAgentId()!;
    const sessionId = created.getSessionId()!;
    await runtime.stop();

    const restarted = await AgentRuntime.start({ stateStore, sessionManager });
    const resumed = await Agent.resume({
      ...agentOptions(),
      sessionId,
      context: createTestContext({ systemPrompt: "Updated system prompt" }),
    });

    expect(resumed.getAgentId()).toBe(agentId);
    expect(resumed.getSessionId()).toBe(sessionId);
    expect(resumed.getContext().systemPrompt).toBe("Updated system prompt");
    expect(resumed.getMessages()[0]?.content).toBe("hello");
    await restarted.stop();
  } finally {
    if (AgentRuntime.current()) await AgentRuntime.current()!.stop();
  }
});

test("Agent.resume rejects a duplicate live binding", async () => {
  const stateStore = new InMemoryRuntimeStateStore();
  const sessionManager = createSessionProvider();
  const runtime = await AgentRuntime.start({ stateStore, sessionManager });

  try {
    const created = await Agent.create(agentOptions("hello"));
    await expect(Agent.resume({ ...agentOptions(), sessionId: created.getSessionId()! }))
      .rejects.toThrow("already bound");
  } finally {
    await runtime.stop();
  }
});

test("Agent.send persists a Run before returning and resolves through AgentRun", async () => {
  const stateStore = new InMemoryRuntimeStateStore();
  const runtime = await AgentRuntime.start({ stateStore, sessionManager: createSessionProvider() });

  try {
    const agent = await Agent.create(agentOptions("hello"));
    const run = await agent.send("continue");
    expect(["queued", "running", "completed"]).toContain(run.status);

    const outcome = await run.result();
    expect(outcome.message).toContain("Direct response");
    expect(run.status).toBe("completed");

    const persisted = await stateStore.getRun(run.id);
    expect(persisted).toMatchObject({ id: run.id, state: "completed", outcome: { message: outcome.message } });
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
    sessionManager: createSessionProvider(),
    maxConcurrentRuns: 2,
  });

  try {
    const first = await Agent.create({ ...agentOptions(), stream: delayedStream });
    const second = await Agent.create({ ...agentOptions(), stream: delayedStream });
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
