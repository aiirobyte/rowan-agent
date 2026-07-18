import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteRuntimeStateStore } from "../../src/runtime";

test("SqliteRuntimeStateStore persists records and leases across reopen", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rowan-runtime-"));
  const filename = join(directory, "runtime.sqlite");

  try {
    const first = new SqliteRuntimeStateStore(filename);
    const agent = await first.createAgent({ sessionId: "session-1" });
    const enqueued = await first.enqueueAgentInput({
      agentId: agent.id,
      input: {
        id: "message-1",
        role: "user",
        content: "hello",
        createdAt: "2026-01-01T00:00:00.000+00:00",
      },
    });
    await first.leaseRun({
      runId: enqueued.run.id,
      workerId: "worker-1",
      leaseDurationMs: 30_000,
      now: new Date("2026-01-01T00:00:00.000Z"),
    });
    first.close();

    const reopened = new SqliteRuntimeStateStore(filename);
    expect(await reopened.getAgent(agent.id)).toMatchObject({ id: agent.id, sessionId: "session-1" });
    expect(await reopened.getRun(enqueued.run.id)).toMatchObject({ state: "running", attempt: 1 });
    expect(await reopened.getMessage(enqueued.message.id)).toMatchObject({
      state: "leased",
      lease: { workerId: "worker-1" },
    });

    const recovered = await reopened.recoverExpiredLeases(new Date("2026-01-01T00:01:00.000Z"));
    expect(recovered).toHaveLength(1);
    expect(await reopened.getRun(enqueued.run.id)).toMatchObject({ state: "queued" });
    expect(await reopened.getMessage(enqueued.message.id)).toMatchObject({ state: "queued" });
    await reopened.leaseRun({
      runId: enqueued.run.id,
      workerId: "worker-2",
      leaseDurationMs: 30_000,
      now: new Date("2026-01-01T00:02:00.000Z"),
    });
    await reopened.suspendRun({
      runId: enqueued.run.id,
      reason: "Agent requested input.",
      inputRequest: {
        phase: "verify",
        prompt: "Which verification environment should I use?",
        requestedAt: "2026-01-01T00:02:01.000+00:00",
      },
    });
    reopened.close();

    const suspended = new SqliteRuntimeStateStore(filename);
    expect(await suspended.getRun(enqueued.run.id)).toMatchObject({
      state: "suspended",
      inputRequest: {
        phase: "verify",
        prompt: "Which verification environment should I use?",
        requestedAt: "2026-01-01T00:02:01.000+00:00",
      },
    });
    suspended.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
