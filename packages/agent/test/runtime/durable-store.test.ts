import { expect, test } from "bun:test";
import {
  InMemoryStore,
  RuntimeError,
} from "../../src/runtime";
import type {
  AssistantMessage,
  ConfigToken,
  InputRequestId,
  MessageId,
} from "../../src/runtime-events";
import type { ExecutionCheckpoint } from "../../src/runtime/contracts";

const token = "config-1" as ConfigToken;

test("Memory DurableStore keeps queued input out of canonical history until claim", async () => {
  const store = new InMemoryStore();
  const owner = await store.openOwner({ ownerId: "owner-1", leaseMs: 10_000 });
  const agent = await owner.reserveAgent({ idempotencyKey: "agent-1", metadata: { name: "demo" } });
  await owner.activateAgent(agent.id);
  await owner.updateAgentConfigToken({ agentId: agent.id, token, idempotencyKey: "config-1" });

  const run = await owner.createRun({ agentId: agent.id, input: "hello", idempotencyKey: "run-1" });
  expect(run.state).toBe("queued");
  expect((await owner.listEvents()).map((event) => event.kind)).toEqual(["run_transitioned"]);

  const claimed = await owner.claimRun({ runId: run.id, expectedRevision: run.revision });
  expect(claimed.run.state).toBe("running");
  expect(claimed.history).toHaveLength(1);
  expect(claimed.history[0]?.role).toBe("user");
  expect((await owner.listEvents()).map((event) => event.kind)).toEqual([
    "run_transitioned",
    "message_committed",
    "run_transitioned",
  ]);
});

test("Memory DurableStore replays a claim without duplicating the canonical input or events", async () => {
  const store = new InMemoryStore();
  const owner = await store.openOwner({ ownerId: "owner-1", leaseMs: 10_000 });
  const agent = await owner.reserveAgent({ idempotencyKey: "agent" });
  const run = await owner.createRun({ agentId: agent.id, input: "hello", idempotencyKey: "run" });
  const first = await owner.claimRun({
    runId: run.id,
    expectedRevision: run.revision,
    executionId: "execution-1" as never,
    messageId: "message-1" as never,
  });
  const replay = await owner.claimRun({
    runId: run.id,
    expectedRevision: run.revision,
    executionId: "execution-1" as never,
    messageId: "message-1" as never,
  });
  expect(replay.run).toEqual(first.run);
  expect((await owner.listEvents()).filter((event) => event.kind === "message_committed")).toHaveLength(1);
});

test("Memory DurableStore replays idempotent writes and rejects changed payloads", async () => {
  const store = new InMemoryStore();
  const owner = await store.openOwner({ ownerId: "owner-1", leaseMs: 10_000 });
  const first = await owner.reserveAgent({ idempotencyKey: "same", metadata: { a: 1 } });
  const replay = await owner.reserveAgent({ idempotencyKey: "same", metadata: { a: 1 } });
  expect(replay.id).toBe(first.id);
  await expect(owner.reserveAgent({ idempotencyKey: "same", metadata: { a: 2 } })).rejects.toMatchObject({ code: "idempotency_conflict" });
});

test("Memory DurableStore commits input boundaries and terminal outcomes atomically", async () => {
  const store = new InMemoryStore();
  const owner = await store.openOwner({ ownerId: "owner-1", leaseMs: 10_000 });
  const agent = await owner.reserveAgent({ idempotencyKey: "agent" });
  const run = await owner.createRun({ agentId: agent.id, input: "deploy", idempotencyKey: "run" });
  const claimed = await owner.claimRun({ runId: run.id, expectedRevision: 0 });
  const prompt: AssistantMessage = {
    id: "prompt-1" as MessageId,
    agentId: agent.id,
    runId: run.id,
    role: "assistant",
    content: "Which target?",
    sequenceWithinRun: 1,
    createdAt: "2026-07-23T00:00:00.000Z",
  };
  const checkpoint: ExecutionCheckpoint = { codec: "rowan.agent.execution", version: 1, data: { phase: "plan" } };
  const waiting = await owner.commitInputRequired({
    runId: run.id,
    execution: claimed.execution,
    expectedRevision: claimed.run.revision,
    requestId: "request-1" as InputRequestId,
    prompt,
    checkpoint,
  });
  expect(waiting.run.state).toBe("input_required");
  const snapshot = await owner.snapshotRun(run.id);
  expect(snapshot.state).toBe("input_required");
  if (snapshot.state === "input_required") expect(snapshot.request.prompt.id).toBe(prompt.id);

  const queued = await owner.answerInput({
    runId: run.id,
    requestId: waiting.request.id,
    expectedRevision: waiting.run.revision,
    input: "production",
  });
  expect(queued.state).toBe("queued");
  const resumed = await owner.claimRun({ runId: run.id, expectedRevision: queued.revision });
  const completed = await owner.commitOutcome({
    runId: run.id,
    execution: resumed.execution,
    expectedRevision: resumed.run.revision,
    outcome: { id: "outcome-1" as never, message: "done" },
  });
  expect(completed.state).toBe("completed");
  expect((await owner.snapshotRun(run.id)).state).toBe("completed");
});

test("Memory DurableStore fences an owner after release", async () => {
  const store = new InMemoryStore();
  const first = await store.openOwner({ ownerId: "owner-1", leaseMs: 10_000 });
  await first.sealAndReleaseOwner();
  const second = await store.openOwner({ ownerId: "owner-2", leaseMs: 10_000 });
  expect(second.lease.epoch).toBe(2);
  await expect(first.listAgents()).rejects.toBeInstanceOf(RuntimeError);
});

test("Memory DurableStore resumes a Consumer from its durable checkpoint", async () => {
  const store = new InMemoryStore();
  const owner = await store.openOwner({ ownerId: "owner-consumer", leaseMs: 10_000 });
  const first = await owner.openConsumer("consumer-1");
  expect(first.cursor).toBeUndefined();
  const agent = await owner.reserveAgent({ idempotencyKey: "agent-consumer" });
  await owner.createRun({ agentId: agent.id, input: "hello", idempotencyKey: "run-consumer" });
  const events = await owner.listEvents();
  await owner.advanceConsumerCheckpoint({ consumerId: "consumer-1", cursor: events[0]!.cursor });
  expect((await owner.openConsumer("consumer-1")).cursor).toBe(events[0]!.cursor);
  await expect(owner.advanceConsumerCheckpoint({ consumerId: "consumer-1", cursor: `${storeIncarnation(events[0]!.cursor)}:999` as never })).rejects.toMatchObject({
    code: "invalid_cursor",
    details: { reason: "beyond_waterline" },
  });
  expect(agent.id).toMatch(/^agt_/);
});

function storeIncarnation(cursor: string): string {
  return cursor.split(":")[0]!;
}
