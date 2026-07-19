import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRuntime, InMemoryRuntimeStateStore, SqliteRuntimeStateStore } from "../../src/runtime";
import { JsonlSessionStore } from "../../src/harness/session";
import { scriptedStream } from "../support/scripted-stream";

async function waitFor(check: () => Promise<boolean>, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for Runtime state.");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test("AgentRuntime allows one process-wide runtime and can restart", async () => {
  const first = await AgentRuntime.start({ stateStore: new InMemoryRuntimeStateStore() });
  await expect(
    AgentRuntime.start({ stateStore: new InMemoryRuntimeStateStore() }),
  ).rejects.toThrow("already started");

  await first.stop();

  const second = await AgentRuntime.start({ stateStore: new InMemoryRuntimeStateStore() });
  await second.stop();
});

test("stopping a Runtime makes its private bindings unavailable", async () => {
  const runtime = await AgentRuntime.start({ stateStore: new InMemoryRuntimeStateStore() });
  await runtime.stop();
  await expect(runtime.stop()).resolves.toBeUndefined();
});

test("starting a Runtime preserves another process's unexpired Lease", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-runtime-live-lease-"));
  const filename = join(root, "runtime.sqlite");
  const ownerStore = new SqliteRuntimeStateStore(filename);
  let observerStore: SqliteRuntimeStateStore | undefined;
  let runtime: AgentRuntime | undefined;

  try {
    const agent = await ownerStore.createAgent({ sessionId: "session-live-owner" });
    const enqueued = await ownerStore.enqueueAgentInput({
      agentId: agent.id,
      input: {
        id: "message-live-owner",
        role: "user",
        content: "keep running",
        createdAt: new Date().toISOString(),
      },
    });
    await ownerStore.leaseRun({
      runId: enqueued.run.id,
      workerId: "other-process",
      leaseDurationMs: 60_000,
    });

    observerStore = new SqliteRuntimeStateStore(filename);
    runtime = await AgentRuntime.start({ stateStore: observerStore });

    expect(await observerStore.getRun(enqueued.run.id)).toMatchObject({
      state: "running",
    });
  } finally {
    await runtime?.stop();
    observerStore?.close();
    ownerStore.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("Runtime recovers an abandoned Lease after it expires", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-runtime-expired-lease-"));
  const filename = join(root, "runtime.sqlite");
  const ownerStore = new SqliteRuntimeStateStore(filename);
  let recoveryStore: SqliteRuntimeStateStore | undefined;
  let runtime: AgentRuntime | undefined;

  try {
    const agent = await ownerStore.createAgent({ sessionId: "session-abandoned-owner" });
    const enqueued = await ownerStore.enqueueAgentInput({
      agentId: agent.id,
      input: {
        id: "message-abandoned-owner",
        role: "user",
        content: "recover after expiry",
        createdAt: new Date().toISOString(),
      },
    });
    await ownerStore.leaseRun({
      runId: enqueued.run.id,
      workerId: "abandoned-process",
      leaseDurationMs: 250,
    });

    recoveryStore = new SqliteRuntimeStateStore(filename);
    runtime = await AgentRuntime.start({
      stateStore: recoveryStore,
      leaseDurationMs: 20,
      leaseRenewalIntervalMs: 10,
    });
    expect(await recoveryStore.getRun(enqueued.run.id)).toMatchObject({ state: "running" });

    await waitFor(async () => (await recoveryStore?.getRun(enqueued.run.id))?.state === "queued");
  } finally {
    await runtime?.stop();
    recoveryStore?.close();
    ownerStore.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("Runtime schedules a reconstructed Run when its abandoned Lease expires", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-runtime-expired-reconstructed-lease-"));
  const filename = join(root, "runtime.sqlite");
  const sessions = new JsonlSessionStore(join(root, "sessions"));
  const manager = await sessions.create({
    systemPrompt: "Recover the abandoned Run.",
    input: "",
    skills: [],
  });
  const ownerStore = new SqliteRuntimeStateStore(filename);
  let recoveryStore: SqliteRuntimeStateStore | undefined;
  let runtime: AgentRuntime | undefined;

  try {
    const agent = await ownerStore.createAgent({ sessionId: manager.getSessionId() });
    const enqueued = await ownerStore.enqueueAgentInput({
      agentId: agent.id,
      input: {
        id: "message-expired-reconstructed-owner",
        role: "user",
        content: "continue after recovery",
        createdAt: new Date().toISOString(),
      },
    });
    await ownerStore.leaseRun({
      runId: enqueued.run.id,
      workerId: "abandoned-reconstructed-process",
      leaseDurationMs: 250,
    });

    recoveryStore = new SqliteRuntimeStateStore(filename);
    runtime = await AgentRuntime.start({
      stateStore: recoveryStore,
      sessionProvider: sessions,
      leaseDurationMs: 20,
      leaseRenewalIntervalMs: 10,
    });
    expect(await recoveryStore.getRun(enqueued.run.id)).toMatchObject({ state: "running" });
    await runtime.reconstructAgent(agent.id, {
      context: {
        systemPrompt: "Recover the abandoned Run.",
        messages: [],
        tools: [],
        skills: [],
      },
      model: { provider: "test", id: "scripted" },
      stream: scriptedStream,
    });

    await waitFor(async () => (
      await runtime?.listRuns({ agentId: agent.id })
    )?.[0]?.state === "completed");
  } finally {
    await runtime?.stop();
    recoveryStore?.close();
    ownerStore.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("failed Runtime startup releases the process-wide ownership slot", async () => {
  class FailingRecoveryStore extends InMemoryRuntimeStateStore {
    override async recoverExpiredLeases(): Promise<import("../../src/runtime/domain").AgentRunRecord[]> {
      throw new Error("recovery failed");
    }
  }

  await expect(AgentRuntime.start({ stateStore: new FailingRecoveryStore() }))
    .rejects.toThrow("recovery failed");
  const runtime = await AgentRuntime.start({ stateStore: new InMemoryRuntimeStateStore() });
  await runtime.stop();
});
