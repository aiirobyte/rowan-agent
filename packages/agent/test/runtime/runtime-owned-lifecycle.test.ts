import { expect, test } from "bun:test";
import {
  Agent,
  AgentRun,
  AgentRuntime,
  InMemoryRuntimeStateStore,
  type AgentContext,
  type SessionManagerProvider,
  type StreamFn,
} from "../../src";
import { ProviderError } from "@rowan-agent/models";
import { InMemorySessionManager } from "../../src/harness/session";
import type { CreateSessionManagerInput, SessionManager } from "../../src/harness/session/session-manager";
import { scriptedStream } from "../support/scripted-stream";

function sessions(): SessionManagerProvider {
  const managers = new Map<string, SessionManager>();
  return {
    async create(input: CreateSessionManagerInput) {
      const manager = InMemorySessionManager.create(input);
      managers.set(manager.getSessionId(), manager);
      return manager;
    },
    async open(sessionId: string) {
      return managers.get(sessionId);
    },
  };
}

function options(input = "") {
  const context: AgentContext = {
    systemPrompt: "Runtime-owned lifecycle test",
    messages: [],
    tools: [],
    skills: [],
  };
  return {
    context,
    model: { provider: "test", id: "scripted" },
    stream: scriptedStream,
    input,
  };
}

async function waitFor(check: () => boolean, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for Runtime behavior.");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test("Runtime creates an Agent that accepts durable input", async () => {
  const runtime = await AgentRuntime.start({
    stateStore: new InMemoryRuntimeStateStore(),
    sessionProvider: sessions(),
  });

  try {
    const agent = await runtime.createAgent(options("hello"));
    expect(agent.id).toMatch(/^agt_/);
    expect(agent.sessionId).toMatch(/^ses_/);

    const run = await agent.send("continue");
    const states: string[] = [];
    run.subscribe((state) => { states.push(state); });
    const outcome = await run.result();
    expect(outcome.message).toContain("Direct response");
    expect(states).toContain("completed");
  } finally {
    await runtime.stop();
  }
});

test("Runtime reconstructs an existing Agent by Agent ID", async () => {
  const stateStore = new InMemoryRuntimeStateStore();
  const sessionManager = sessions();
  const firstRuntime = await AgentRuntime.start({ stateStore, sessionProvider: sessionManager });
  const created = await firstRuntime.createAgent(options("hello"));
  const agentId = created.id;
  const sessionId = created.sessionId;
  await firstRuntime.stop();

  const secondRuntime = await AgentRuntime.start({ stateStore, sessionProvider: sessionManager });
  try {
    const reconstructed = await secondRuntime.reconstructAgent(agentId, options());
    expect(reconstructed.id).toBe(agentId);
    expect(reconstructed.sessionId).toBe(sessionId);
  } finally {
    await secondRuntime.stop();
  }
});

test("Agent exposes no compatibility lifecycle", async () => {
  expect(Object.hasOwn(Agent, "create")).toBe(false);
  expect(Object.hasOwn(Agent, "resume")).toBe(false);
  expect(() => new (Agent as unknown as new (value: unknown) => Agent)(options()))
    .toThrow("Agent lifecycle is owned by AgentRuntime");

  const runtime = await AgentRuntime.start({
    stateStore: new InMemoryRuntimeStateStore(),
    sessionProvider: sessions(),
  });
  try {
    const agent = await runtime.createAgent(options());
    expect("run" in agent).toBe(false);
    expect("runWithUserInput" in agent).toBe(false);
    const run = await agent.send("inspect handle");
    expect("runtime" in run).toBe(false);
    expect("stateStore" in run).toBe(false);
    expect(() => new (AgentRun as unknown as new (...args: unknown[]) => AgentRun)())
      .toThrow("AgentRun lifecycle is owned by AgentRuntime");
    await run.result();
  } finally {
    await runtime.stop();
  }
});

test("paused Agents keep new input queued until resumeAgent", async () => {
  const stateStore = new InMemoryRuntimeStateStore();
  const runtime = await AgentRuntime.start({ stateStore, sessionProvider: sessions() });
  try {
    const agent = await runtime.createAgent(options());
    await runtime.pauseAgent(agent.id);
    const run = await agent.send("wait for resume");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await stateStore.getRun(run.id)).toMatchObject({ state: "queued" });

    await runtime.resumeAgent(agent.id);
    expect((await run.result()).message).toContain("Direct response");
  } finally {
    await runtime.stop();
  }
});

test("aborting a queued AgentRun does not abort another Run executing for the Agent", async () => {
  const stateStore = new InMemoryRuntimeStateStore();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let invocations = 0;
  const stream: StreamFn = async function* (request, streamOptions) {
    invocations += 1;
    await gate;
    yield* scriptedStream(request, streamOptions);
  };
  const runtime = await AgentRuntime.start({ stateStore, sessionProvider: sessions() });

  try {
    const agent = await runtime.createAgent({ ...options(), stream });
    const active = await agent.send("active");
    await waitFor(() => invocations === 1);
    const queued = await agent.send("queued");
    await queued.abort("cancel only queued work");
    release();

    expect((await active.result()).message).toContain("Direct response");
    expect(await queued.result()).toMatchObject({ message: "cancel only queued work" });
    expect(queued.status).toBe("cancelled");
    expect(invocations).toBe(1);
  } finally {
    await runtime.stop();
  }
});

test("Scheduler retries only Infrastructure Failures and dead-letters exhausted work", async () => {
  let attempts = 0;
  const failingStream: StreamFn = async function* () {
    attempts += 1;
    throw new ProviderError({
      code: "transport_unavailable",
      message: "temporary model transport failure",
      retryable: true,
    });
  };
  const runtime = await AgentRuntime.start({
    stateStore: new InMemoryRuntimeStateStore(),
    sessionProvider: sessions(),
    maxInfrastructureAttempts: 2,
  });

  try {
    const agent = await runtime.createAgent({ ...options(), stream: failingStream });
    const run = await agent.send("retry me");
    const outcome = await run.result();
    const eventKinds = (await runtime.listEvents()).map((event) => event.kind);

    expect(attempts).toBe(2);
    expect(run.status).toBe("failed");
    expect(outcome.message).toContain("temporary model transport failure");
    expect(eventKinds).toContain("run_retry_scheduled");
    expect(eventKinds).toContain("message_dead_lettered");
  } finally {
    await runtime.stop();
  }
});

test("Scheduler renews the Lease while an Agent Run is executing", async () => {
  const stateStore = new InMemoryRuntimeStateStore();
  const delayedStream: StreamFn = async function* (request, streamOptions) {
    await new Promise((resolve) => setTimeout(resolve, 60));
    yield* scriptedStream(request, streamOptions);
  };
  const runtime = await AgentRuntime.start({
    stateStore,
    sessionProvider: sessions(),
    leaseDurationMs: 30,
    leaseRenewalIntervalMs: 10,
  });

  try {
    const agent = await runtime.createAgent({ ...options(), stream: delayedStream });
    const run = await agent.send("slow work");
    let runtimeMessageId: import("../../src/runtime/domain").RuntimeMessageId | undefined;
    let firstExpiry: string | undefined;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const record = await stateStore.getRun(run.id);
      if (record?.state === "running") {
        runtimeMessageId = record.messageId;
        firstExpiry = (await stateStore.getMessage(record.messageId))?.lease?.expiresAt;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    expect(firstExpiry).toBeDefined();

    await new Promise((resolve) => setTimeout(resolve, 25));
    const renewedExpiry = (await stateStore.getMessage(runtimeMessageId!))?.lease?.expiresAt;
    expect(Date.parse(renewedExpiry!)).toBeGreaterThan(Date.parse(firstExpiry!));
    await run.result();
  } finally {
    await runtime.stop();
  }
});

test("Lease renewal failure aborts the attempt and retries it as an Infrastructure Failure", async () => {
  class RenewalFailureStore extends InMemoryRuntimeStateStore {
    private failed = false;

    override async renewLease(input: Parameters<InMemoryRuntimeStateStore["renewLease"]>[0]) {
      if (!this.failed) {
        this.failed = true;
        throw new Error("lease backend unavailable");
      }
      return super.renewLease(input);
    }
  }

  let attempts = 0;
  const stream: StreamFn = async function* (request, streamOptions) {
    attempts += 1;
    if (attempts === 1) {
      await new Promise<void>((resolve) => {
        if (streamOptions.signal?.aborted) resolve();
        else streamOptions.signal?.addEventListener("abort", () => resolve(), { once: true });
      });
      return;
    }
    yield* scriptedStream(request, streamOptions);
  };
  const runtime = await AgentRuntime.start({
    stateStore: new RenewalFailureStore(),
    sessionProvider: sessions(),
    leaseDurationMs: 30,
    leaseRenewalIntervalMs: 10,
    maxInfrastructureAttempts: 2,
  });

  try {
    const agent = await runtime.createAgent({ ...options(), stream });
    const run = await agent.send("retry after lease loss");
    expect((await run.result()).message).toContain("Direct response");
    expect(attempts).toBe(2);
    expect((await runtime.listEvents()).map((event) => event.kind)).toContain("run_retry_scheduled");
  } finally {
    await runtime.stop();
  }
});

test("Runtime startup recovers every Lease abandoned by the previous process", async () => {
  const stateStore = new InMemoryRuntimeStateStore();
  const agent = await stateStore.createAgent({ sessionId: "session-abandoned" });
  const enqueued = await stateStore.enqueueAgentInput({
    agentId: agent.id,
    input: {
      id: "message-abandoned",
      role: "user",
      content: "recover",
      createdAt: "2026-01-01T00:00:00.000+00:00",
    },
  });
  await stateStore.leaseRun({
    runId: enqueued.run.id,
    workerId: "dead-process",
    leaseDurationMs: 48 * 60 * 60 * 1_000,
  });

  const runtime = await AgentRuntime.start({ stateStore });
  try {
    expect(await stateStore.getRun(enqueued.run.id)).toMatchObject({ state: "queued" });
  } finally {
    await runtime.stop();
  }
});

test("Runtime Event Consumer advances its Checkpoint only after successful delivery", async () => {
  const runtime = await AgentRuntime.start({
    stateStore: new InMemoryRuntimeStateStore(),
    sessionProvider: sessions(),
  });
  const consumerId = "runtime-test-consumer";
  const deliveries: string[] = [];

  try {
    const stopFailingConsumer = runtime.consumeEvents(consumerId, async (event) => {
      deliveries.push(`failed:${event.id}`);
      throw new Error("consumer unavailable");
    });
    await runtime.createAgent(options());
    await waitFor(() => deliveries.length === 1);
    stopFailingConsumer();

    const stopSuccessfulConsumer = runtime.consumeEvents(consumerId, (event) => {
      deliveries.push(`ok:${event.id}`);
    });
    await waitFor(() => deliveries.some((delivery) => delivery.startsWith("ok:")));
    stopSuccessfulConsumer();

    const deliveredAfterSuccess = deliveries.length;
    const stopCaughtUpConsumer = runtime.consumeEvents(consumerId, (event) => {
      deliveries.push(`unexpected:${event.id}`);
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    stopCaughtUpConsumer();

    expect(deliveries[0]?.replace("failed:", "")).toBe(deliveries[1]?.replace("ok:", ""));
    expect(deliveries).toHaveLength(deliveredAfterSuccess);
  } finally {
    await runtime.stop();
  }
});

test("slow Runtime Event Consumers do not block durable state transitions", async () => {
  const runtime = await AgentRuntime.start({
    stateStore: new InMemoryRuntimeStateStore(),
    sessionProvider: sessions(),
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const consumerId = "slow-runtime-consumer";
  const stop = runtime.consumeEvents(consumerId, () => gate);

  try {
    const creation = runtime.createAgent(options());
    const result = await Promise.race([
      creation.then(() => "created" as const),
      new Promise<"blocked">((resolve) => setTimeout(() => resolve("blocked"), 30)),
    ]);
    expect(result).toBe("created");
  } finally {
    release();
    stop();
    await runtime.stop();
  }
});
