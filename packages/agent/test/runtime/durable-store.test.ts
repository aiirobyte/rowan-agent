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
  expect((await owner.listEvents()).map((event) => event.kind)).toEqual(["run_state_changed"]);

  const claimed = await owner.claimRun({ runId: run.id, expectedRevision: run.revision });
  expect(claimed.run.state).toBe("running");
  expect(claimed.history).toHaveLength(1);
  expect(claimed.history[0]?.role).toBe("user");
  expect((await owner.listEvents()).map((event) => event.kind)).toEqual([
    "run_state_changed",
    "message_committed",
    "run_state_changed",
  ]);
});

test("Memory DurableStore keeps manual input for every Control Run and skips empty system input", async () => {
  const store = new InMemoryStore();
  const owner = await store.openOwner({ ownerId: "owner-control", leaseMs: 10_000 });
  const agent = await owner.reserveAgent({ idempotencyKey: "agent-control" });
  await owner.activateAgent(agent.id);
  await owner.updateAgentConfigToken({ agentId: agent.id, token, idempotencyKey: "config-control" });

  const manual = await owner.createRun({
    agentId: agent.id,
    input: "manual control input",
    metadata: { rowan: { kind: "custom-control" } },
    idempotencyKey: "run-manual-control",
  });
  const claimed = await owner.claimRun({ runId: manual.id, expectedRevision: manual.revision });
  expect(claimed.history.at(-1)).toMatchObject({
    role: "user",
    content: "manual control input",
  });
  await owner.commitOutcome({
    runId: manual.id,
    execution: claimed.execution,
    expectedRevision: claimed.run.revision,
    outcome: { id: "outcome-control" as never, message: "done" },
  });

  const system = await owner.createRun({
    agentId: agent.id,
    input: "",
    metadata: { rowan: { kind: "custom-control" } },
    idempotencyKey: "run-system-control",
  });
  const systemClaim = await owner.claimRun({ runId: system.id, expectedRevision: system.revision });
  expect((await owner.snapshotRun(system.id)).messageCount).toBe(0);
  expect(systemClaim.history.at(-1)).toMatchObject({
    role: "user",
    content: "manual control input",
  });
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

test("Memory DurableStore physically deletes an Agent and all owned Run data", async () => {
  const store = new InMemoryStore();
  const owner = await store.openOwner({ ownerId: "owner-delete", leaseMs: 10_000 });
  const agent = await owner.reserveAgent({ idempotencyKey: "agent-delete" });
  const run = await owner.createRun({ agentId: agent.id, input: "remove me", idempotencyKey: "run-delete" });

  await owner.deleteAgent({
    agentId: agent.id,
    expectedRunIds: [run.id],
    confirmation: "conversation-delete-v1",
  });

  expect(await owner.listAgents()).toEqual([]);
  expect(await owner.listRuns()).toEqual([]);
  expect(await owner.listEvents()).toEqual([]);
  await expect(owner.snapshotRun(run.id)).rejects.toMatchObject({ code: "run_not_found" });
});

test("Memory DurableStore keeps an interrupted assistant output on cancellation", async () => {
  const store = new InMemoryStore();
  const owner = await store.openOwner({ ownerId: "owner-partial", leaseMs: 10_000 });
  const agent = await owner.reserveAgent({ idempotencyKey: "agent-partial" });
  const run = await owner.createRun({ agentId: agent.id, input: "continue later", idempotencyKey: "run-partial" });
  const claim = await owner.claimRun({ runId: run.id, expectedRevision: run.revision });
  const output: AssistantMessage = {
    id: "assistant-partial" as MessageId,
    agentId: agent.id,
    runId: run.id,
    role: "assistant",
    content: "Draft retained before stop.",
    interrupted: true,
    sequenceWithinRun: 1,
    createdAt: "2026-08-13T00:00:00.000Z",
  };

  const cancelled = await owner.cancelRun({
    runId: run.id,
    expectedRevision: claim.run.revision,
    reason: "user stopped",
    output,
  });

  expect(cancelled.state).toBe("cancelled");
  expect(await owner.listEvents()).toContainEqual(expect.objectContaining({
    kind: "message_committed",
    message: expect.objectContaining({ id: output.id, interrupted: true, content: output.content }),
  }));
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
  const inputRequired = {
    runId: run.id,
    execution: claimed.execution,
    expectedRevision: claimed.run.revision,
    requestId: "request-1" as InputRequestId,
    prompt,
    checkpoint,
  };
  await expect(owner.commitInputRequired({ ...inputRequired, phase: "" })).rejects.toBeInstanceOf(TypeError);
  const waiting = await owner.commitInputRequired({ ...inputRequired, phase: "plan" });
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

test("Memory DurableStore renews an expired lease until another owner claims it", async () => {
  const store = new InMemoryStore();
  const owner = await store.openOwner({ ownerId: "owner-1", leaseMs: 20 });
  await new Promise((resolve) => setTimeout(resolve, 40));

  const renewed = await owner.renewOwner(10_000);

  expect(renewed).toMatchObject({
    ownerId: "owner-1",
    epoch: owner.lease.epoch,
    token: owner.lease.token,
  });
  await expect(owner.listAgents()).resolves.toEqual([]);
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
