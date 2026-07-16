import { expect, test } from "bun:test";
import {
  asFactoryId,
  InMemoryRuntimeStateStore,
  SqliteRuntimeStateStore,
  type RuntimeStateStore,
} from "../../src/runtime";

export function defineRuntimeStateStoreContract(createStore: () => RuntimeStateStore): void {
  test("creates opaque Agents and atomically enqueues Agent Input with a Run", async () => {
    const store = createStore();
    const agent = await store.createAgent({
      sessionId: "session-1",
      factoryId: asFactoryId("factory-test"),
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

  test("completes a leased Run and acknowledges its triggering Message", async () => {
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

    const acknowledged = await store.acknowledgeMessage(enqueued.message.id);
    expect(acknowledged.state).toBe("acknowledged");
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

  test("atomically completes a Child Run and enqueues its parent completion Message", async () => {
    const store = createStore();
    const parentAgent = await store.createAgent({ sessionId: "parent-session" });
    const childAgent = await store.createAgent({ sessionId: "child-session" });
    const parent = await store.enqueueAgentInput({ agentId: parentAgent.id, input: {
      id: "parent-message",
      role: "user",
      content: "start child",
      createdAt: "2026-01-01T00:00:00.000+00:00",
    } });
    const child = await store.enqueueAgentInput({
      agentId: childAgent.id,
      parentRunId: parent.run.id,
      input: {
        id: "child-message",
        role: "user",
        content: "child work",
        createdAt: "2026-01-01T00:00:00.000+00:00",
      },
    });
    await store.leaseRun({ runId: child.run.id, workerId: "worker-1", leaseDurationMs: 30_000 });

    const completed = await store.completeChildRun({
      runId: child.run.id,
      parent: { agentId: parentAgent.id, runId: parent.run.id },
      outcome: { id: "child-outcome", message: "child done" },
    });
    expect(completed.childRun.state).toBe("completed");
    expect(completed.childRun.parentRunId).toBe(parent.run.id);
    expect(completed.message.agentId).toBe(parentAgent.id);
    expect(completed.message.kind).toBe("child_run_completion");
    expect(completed.message.payload.type).toBe("child_run_completion");
    expect((await store.getMessage(child.message.id))?.state).toBe("acknowledged");
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

    const manualMessage = await store.enqueueMessage({
      agentId: agent.id,
      payload: {
        type: "child_run_completion",
        childAgentId: agent.id,
        childRunId: enqueued.run.id,
        parentRunId: enqueued.run.id,
        outcome: { id: "outcome-2", message: "child done" },
      },
    });
    await expect(store.acknowledgeMessage(manualMessage.id)).resolves.toMatchObject({ state: "acknowledged" });
    await expect(store.acknowledgeMessage(manualMessage.id)).rejects.toThrow(/acknowledged/);
    await expect(store.deadLetterMessage(manualMessage.id, "already acknowledged")).rejects.toThrow(/acknowledged/);
  });

  test("dead-letters queued messages and records an acknowledged Runtime Event", async () => {
    const store = createStore();
    const agent = await store.createAgent({ sessionId: "session-1" });
    const message = await store.enqueueMessage({
      agentId: agent.id,
      payload: {
        type: "agent_input",
        input: {
          id: "message-1",
          role: "user",
          content: "hello",
          createdAt: "2026-01-01T00:00:00.000+00:00",
        },
      },
    });

    const deadLettered = await store.deadLetterMessage(message.id, "exhausted retries");
    expect(deadLettered.state).toBe("dead_lettered");

    const event = (await store.listEvents()).at(-1);
    expect(event?.state).toBe("pending");
    expect(event?.kind).toBe("message_dead_lettered");
    const acknowledged = await store.acknowledgeEvent(event!.id);
    expect(acknowledged.state).toBe("acknowledged");
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
}

defineRuntimeStateStoreContract(() => new InMemoryRuntimeStateStore());
defineRuntimeStateStoreContract(() => new SqliteRuntimeStateStore());
