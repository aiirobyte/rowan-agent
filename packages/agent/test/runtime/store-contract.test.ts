import { expect, test } from "bun:test";
import {
  InMemoryRuntimeStateStore,
  SqliteRuntimeStateStore,
  type RuntimeStateStore,
} from "../../src/runtime";

export function defineRuntimeStateStoreContract(createStore: () => RuntimeStateStore): void {
  test("creates opaque Agents and atomically enqueues Agent Input with a Run", async () => {
    const store = createStore();
    const agent = await store.createAgent({
      sessionId: "session-1",
      factoryId: "factory-test",
    });

    const enqueued = await store.enqueueAgentInput({
      agentId: agent.id,
      input: {
        id: "message-1",
        role: "user",
        content: "hello",
        createdAt: "2026-01-01T00:00:00.000+00:00",
      },
    });

    expect(agent.id).toMatch(/^agt_/);
    expect(agent.state).toBe("active");
    expect(enqueued.message.state).toBe("queued");
    expect(enqueued.message.kind).toBe("agent_input");
    expect(enqueued.message.input.content).toBe("hello");
    expect(enqueued.run.state).toBe("queued");
    expect(enqueued.run.agentId).toBe(agent.id);
    expect(enqueued.run.messageId).toBe(enqueued.message.id);
  });

  test("moves a Run through lease, suspension, and completion states", async () => {
    const store = createStore();
    const agent = await store.createAgent({ sessionId: "session-1" });
    const enqueued = await store.enqueueAgentInput({
      agentId: agent.id,
      input: {
        id: "message-1",
        role: "user",
        content: "hello",
        createdAt: "2026-01-01T00:00:00.000+00:00",
      },
    });

    const leased = await store.leaseRun({
      runId: enqueued.run.id,
      workerId: "worker-1",
      leaseDurationMs: 30_000,
    });
    expect(leased.run.state).toBe("running");
    expect(leased.message.state).toBe("leased");
    expect(leased.lease.workerId).toBe("worker-1");

    const suspended = await store.suspendRun({
      runId: enqueued.run.id,
      reason: "waiting for human input",
    });
    expect(suspended.state).toBe("suspended");
    expect(suspended.leaseId).toBeUndefined();

    await expect(
      store.completeRun({
        runId: enqueued.run.id,
        outcome: { id: "outcome-1", message: "done" },
      }),
    ).rejects.toThrow(/suspended/);
  });

  test("atomically completes a leased Run and acknowledges its triggering Message", async () => {
    const store = createStore();
    const agent = await store.createAgent({ sessionId: "session-1" });
    const enqueued = await store.enqueueAgentInput({
      agentId: agent.id,
      input: {
        id: "message-1",
        role: "user",
        content: "hello",
        createdAt: "2026-01-01T00:00:00.000+00:00",
      },
    });

    await store.leaseRun({ runId: enqueued.run.id, workerId: "worker-1", leaseDurationMs: 30_000 });
    const completed = await store.completeRun({
      runId: enqueued.run.id,
      outcome: { id: "outcome-1", message: "done" },
    });
    expect(completed.state).toBe("completed");
    expect(completed.outcome?.message).toBe("done");

    expect(await store.getMessage(enqueued.message.id)).toMatchObject({ state: "acknowledged" });
  });

  test("recovers an expired lease back to queued work", async () => {
    const store = createStore();
    const agent = await store.createAgent({ sessionId: "session-1" });
    const enqueued = await store.enqueueAgentInput({
      agentId: agent.id,
      input: {
        id: "message-1",
        role: "user",
        content: "hello",
        createdAt: "2026-01-01T00:00:00.000+00:00",
      },
    });
    await store.leaseRun({
      runId: enqueued.run.id,
      workerId: "worker-1",
      leaseDurationMs: 10,
      now: new Date("2026-01-01T00:00:00.000Z"),
    });

    const recovered = await store.recoverExpiredLeases(new Date("2026-01-01T00:01:00.000Z"));
    expect(recovered).toHaveLength(1);
    expect(recovered[0]?.state).toBe("queued");
    expect((await store.getMessage(enqueued.message.id))?.state).toBe("queued");
  });

  test("renews the current Lease without changing Run ownership", async () => {
    const store = createStore();
    const agent = await store.createAgent({ sessionId: "session-1" });
    const enqueued = await store.enqueueAgentInput({
      agentId: agent.id,
      input: {
        id: "message-1",
        role: "user",
        content: "hello",
        createdAt: "2026-01-01T00:00:00.000+00:00",
      },
    });
    const leased = await store.leaseRun({
      runId: enqueued.run.id,
      workerId: "worker-1",
      leaseDurationMs: 10_000,
      now: new Date("2026-01-01T00:00:00.000Z"),
    });

    const renewed = await store.renewLease({
      runId: leased.run.id,
      leaseId: leased.lease.id,
      leaseDurationMs: 30_000,
      now: new Date("2026-01-01T00:00:05.000Z"),
    });

    expect(renewed.id).toBe(leased.lease.id);
    expect(renewed.expiresAt).toBe("2026-01-01T00:00:35.000+00:00");
    expect((await store.getRun(leased.run.id))?.state).toBe("running");
  });

  test("rejects invalid lifecycle transitions", async () => {
    const store = createStore();
    const agent = await store.createAgent({ sessionId: "session-1" });
    const enqueued = await store.enqueueAgentInput({
      agentId: agent.id,
      input: {
        id: "message-1",
        role: "user",
        content: "hello",
        createdAt: "2026-01-01T00:00:00.000+00:00",
      },
    });

    await expect(
      store.leaseRun({ runId: enqueued.run.id, workerId: "worker-1", leaseDurationMs: 30_000 }),
    ).resolves.toBeDefined();
    await expect(
      store.leaseRun({ runId: enqueued.run.id, workerId: "worker-2", leaseDurationMs: 30_000 }),
    ).rejects.toThrow(/running/);
    await expect(
      store.suspendRun({ runId: enqueued.run.id }),
    ).resolves.toMatchObject({ state: "suspended" });
    await expect(
      store.suspendRun({ runId: enqueued.run.id }),
    ).rejects.toThrow(/suspended/);
  });

  test("dead-letters queued messages and advances one Runtime Event Consumer Checkpoint", async () => {
    const store = createStore();
    const agent = await store.createAgent({ sessionId: "session-1" });
    const enqueued = await store.enqueueAgentInput({
      agentId: agent.id,
      input: {
        id: "message-1",
        role: "user",
        content: "hello",
        createdAt: "2026-01-01T00:00:00.000+00:00",
      },
    });

    await store.leaseRun({ runId: enqueued.run.id, workerId: "worker-1", leaseDurationMs: 30_000 });
    await store.exhaustRun({
      runId: enqueued.run.id,
      outcome: { id: "outcome-1", message: "exhausted retries" },
      reason: "exhausted retries",
    });
    expect(await store.getMessage(enqueued.message.id)).toMatchObject({
      state: "dead_lettered",
      deadLetterReason: "exhausted retries",
    });

    const event = (await store.listEvents()).at(-1);
    expect(event?.kind).toBe("message_dead_lettered");
    const consumerId = "store-contract-consumer";
    expect(await store.getEventCheckpoint(consumerId)).toMatchObject({ consumerId, sequence: 0 });
    await expect(store.acknowledgeEvent(consumerId, event!.id)).rejects.toThrow(/Checkpoint/);
    let checkpoint = await store.getEventCheckpoint(consumerId);
    for (const pendingEvent of await store.listEvents()) {
      checkpoint = await store.acknowledgeEvent(consumerId, pendingEvent.id);
    }
    expect(checkpoint).toMatchObject({ consumerId, sequence: event!.sequence, eventId: event!.id });
  });

  test("marks only a running Tool Call indeterminate", async () => {
    const store = createStore();
    const agent = await store.createAgent({ sessionId: "session-1" });
    const enqueued = await store.enqueueAgentInput({
      agentId: agent.id,
      input: {
        id: "message-1",
        role: "user",
        content: "hello",
        createdAt: "2026-01-01T00:00:00.000+00:00",
      },
    });
    const call = await store.createToolCall({
      agentId: agent.id,
      runId: enqueued.run.id,
      name: "send-email",
      args: { to: "user@example.com" },
    });

    await expect(store.markToolCallIndeterminate({ toolCallId: call.id, reason: "process lost" }))
      .rejects.toThrow(/queued/);
    await expect(store.startToolCall(call.id)).resolves.toMatchObject({ state: "running" });
    const indeterminate = await store.markToolCallIndeterminate({
      toolCallId: call.id,
      reason: "process lost after side effect",
    });
    expect(indeterminate.state).toBe("indeterminate");
    expect(indeterminate.indeterminateReason).toContain("side effect");
    await expect(store.startToolCall(call.id)).rejects.toThrow(/indeterminate/);
  });

  test("fails a queued Tool Call only when execution never started", async () => {
    const store = createStore();
    const agent = await store.createAgent({ sessionId: "session-1" });
    const enqueued = await store.enqueueAgentInput({
      agentId: agent.id,
      input: {
        id: "message-1",
        role: "user",
        content: "hello",
        createdAt: "2026-01-01T00:00:00.000+00:00",
      },
    });
    const call = await store.createToolCall({
      agentId: agent.id,
      runId: enqueued.run.id,
      name: "queued-tool",
      args: {},
    });
    const result = {
      toolCallId: call.id,
      toolName: call.name,
      ok: false,
      content: "cancelled before start",
      error: "cancelled before start",
    };

    await expect(store.completeToolCall({ toolCallId: call.id, result, state: "failed" }))
      .resolves.toMatchObject({ state: "failed" });
  });
}

defineRuntimeStateStoreContract(() => new InMemoryRuntimeStateStore());
defineRuntimeStateStoreContract(() => new SqliteRuntimeStateStore());
