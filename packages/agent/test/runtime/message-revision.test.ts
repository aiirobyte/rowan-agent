import { expect, test } from "bun:test";
import { InMemoryStore, SqliteStore } from "../../src/runtime";
import type { ConfigToken, MessageId, Message, RunId } from "../../src/runtime-events";

const token = "config-revision" as ConfigToken;

test("Message revision keeps identity, fences the suffix, and queues one replacement Run", async () => {
  const store = new InMemoryStore();
  const owner = await store.openOwner({ ownerId: "revision-owner", leaseMs: 10_000 });
  const agent = await owner.reserveAgent({ idempotencyKey: "agent" });
  await owner.activateAgent(agent.id, token, "revision-config");

  const first = await owner.createRun({ agentId: agent.id, input: "old", idempotencyKey: "first" });
  const claimed = await owner.claimRun({ runId: first.id, expectedRevision: first.revision, configToken: token });
  const target = claimed.history[0]!;
  await owner.commitOutcome({
    runId: first.id,
    execution: claimed.execution,
    expectedRevision: claimed.run.revision,
    outcome: { id: "outcome-first" as never, message: "old answer" },
  });

  const later = await owner.createRun({ agentId: agent.id, input: "later", idempotencyKey: "later" });
  const laterClaim = await owner.claimRun({ runId: later.id, expectedRevision: later.revision, configToken: token });
  await owner.commitOutcome({
    runId: later.id,
    execution: laterClaim.execution,
    expectedRevision: laterClaim.run.revision,
    outcome: { id: "outcome-later" as never, message: "later answer" },
  });

  const revised = await owner.reviseMessage({
    agentId: agent.id,
    messageId: target.id,
    expectedMessageRevision: 0,
    content: "new",
    operationId: "edit-1",
  });

  expect(revised.message.id).toBe(target.id);
  expect(revised.message.messageRevision).toBe(1);
  expect(revised.message.content).toBe("new");
  expect(revised.replacementRun.state).toBe("queued");
  expect(revised.invalidatedRunIds).toEqual([first.id, later.id]);
  expect((await owner.listEvents()).filter((event) => event.kind === "message_revised")).toHaveLength(1);
  await expect(owner.reviseMessage({
    agentId: agent.id,
    messageId: target.id,
    expectedMessageRevision: 0,
    content: "new",
    operationId: "edit-1",
  })).resolves.toMatchObject({
    message: { id: target.id, messageRevision: 1 },
    replacementRun: { id: revised.replacementRun.id },
  });

  const replacement = await owner.claimRun({
    runId: revised.replacementRun.id,
    expectedRevision: revised.replacementRun.revision,
    configToken: token,
  });
  expect(replacement.history).toHaveLength(1);
  expect(replacement.history[0]).toMatchObject({ id: target.id, content: "new", messageRevision: 1 });
  expect((await owner.listEvents()).filter((event) => event.kind === "message_committed")).toHaveLength(2);

  await expect(owner.reviseMessage({
    agentId: agent.id,
    messageId: target.id,
    expectedMessageRevision: 0,
    content: "stale",
    operationId: "edit-stale",
  })).rejects.toMatchObject({ code: "message_revision_conflict" });
});

test("Message revision requires confirmation when the suffix contains Tool Calls", async () => {
  const store = new InMemoryStore();
  const owner = await store.openOwner({ ownerId: "revision-tools", leaseMs: 10_000 });
  const agent = await owner.reserveAgent({ idempotencyKey: "agent" });
  await owner.activateAgent(agent.id, token, "revision-config");
  const run = await owner.createRun({ agentId: agent.id, input: "old", idempotencyKey: "run" });
  const claimed = await owner.claimRun({ runId: run.id, expectedRevision: run.revision, configToken: token });
  const target = claimed.history[0]!;
  const tool = await owner.reserveToolCall({
    runId: run.id,
    execution: claimed.execution,
    expectedRevision: claimed.run.revision,
    requestMessageId: "request-message" as MessageId,
    name: "write",
    args: { value: 1 },
  });

  await expect(owner.reviseMessage({
    agentId: agent.id,
    messageId: target.id,
    expectedMessageRevision: 0,
    content: "new",
    operationId: "edit-tool",
  })).rejects.toMatchObject({
    code: "tool_effect_confirmation_required",
    details: { effectDigest: expect.any(String), toolCallIds: [tool.toolCall.id] },
  });
  const latestEvent = (await owner.listEvents()).at(-1);
  await owner.advanceConsumerCheckpoint({
    consumerId: "tool-retention-consumer",
    cursor: latestEvent!.cursor,
  });
  await expect(owner.compact({ now: "2999-01-01T00:00:00.000Z", retentionMs: 0 })).resolves.toMatchObject({
    deletedEventCount: 0,
    skipped: "no_eligible_events",
  });
});

test("SQLite DurableStore persists the active revised Message projection", async () => {
  const store = new SqliteStore(":memory:");
  const owner = await store.openOwner({ ownerId: "sqlite-revision", leaseMs: 10_000 });
  const agent = await owner.reserveAgent({ idempotencyKey: "agent" });
  await owner.activateAgent(agent.id, token, "revision-config");
  const run = await owner.createRun({ agentId: agent.id, input: "old", idempotencyKey: "run" });
  const claimed = await owner.claimRun({ runId: run.id, expectedRevision: run.revision, configToken: token });
  const revised = await owner.reviseMessage({
    agentId: agent.id,
    messageId: claimed.history[0]!.id,
    expectedMessageRevision: 0,
    content: "new",
    operationId: "edit-sqlite",
  });
  const replacement = await owner.claimRun({ runId: revised.replacementRun.id, expectedRevision: revised.replacementRun.revision, configToken: token });
  expect(replacement.history[0]).toMatchObject({ id: claimed.history[0]!.id, content: "new", messageRevision: 1 });
  store.close();
});

test("history seed copies active context with fresh identities and no Run", async () => {
  const store = new InMemoryStore();
  const sourceAgent = "source-agent" as never;
  const sourceRun = "source-run" as RunId;
  const seed: Message[] = [
    {
      id: "source-user" as MessageId,
      agentId: sourceAgent,
      runId: sourceRun,
      role: "user",
      content: "before",
      sequenceWithinRun: 0,
      createdAt: "2026-08-14T00:00:00.000Z",
    },
    {
      id: "source-assistant" as MessageId,
      agentId: sourceAgent,
      runId: sourceRun,
      role: "assistant",
      content: "answer",
      sequenceWithinRun: 1,
      createdAt: "2026-08-14T00:00:01.000Z",
    },
  ];
  const owner = await store.openOwner({ ownerId: "seed-owner", leaseMs: 10_000 });
  const agent = await owner.reserveAgent({ idempotencyKey: "seed-agent", historySeed: seed });
  expect(await owner.listRuns({ agentId: agent.id })).toEqual([]);
  const run = await owner.createRun({ agentId: agent.id, input: "next", idempotencyKey: "seed-run" });
  const claimed = await owner.claimRun({ runId: run.id, expectedRevision: run.revision });
  expect(claimed.history.map((message) => message.content)).toEqual(["before", "answer", "next"]);
  expect(claimed.history.slice(0, 2).map((message) => message.id)).not.toEqual(seed.map((message) => message.id));
  expect(claimed.history.slice(0, 2).every((message) => message.agentId === agent.id)).toBe(true);
});

test("a forked seed user Message can be revised without creating a duplicate", async () => {
  const store = new InMemoryStore();
  const owner = await store.openOwner({ ownerId: "seed-edit-owner", leaseMs: 10_000 });
  const sourceAgent = "source-agent" as never;
  const seed: Message[] = [{
    id: "source-user" as MessageId,
    agentId: sourceAgent,
    runId: "source-run" as RunId,
    role: "user",
    content: "before",
    sequenceWithinRun: 0,
    createdAt: "2026-08-14T00:00:00.000Z",
  }];
  const agent = await owner.reserveAgent({ idempotencyKey: "seed-edit-agent", historySeed: seed });
  await owner.activateAgent(agent.id, token, "revision-config");
  const copied = (await owner.history(agent.id))[0]!;
  const revised = await owner.reviseMessage({
    agentId: agent.id,
    messageId: copied.id,
    expectedMessageRevision: 0,
    content: "after",
    operationId: "seed-edit",
  });
  expect(revised.message.id).toBe(copied.id);
  expect(revised.replacementRun.state).toBe("queued");
  expect((await owner.history(agent.id)).map((message) => message.content)).toEqual(["after"]);
});

test("retention compaction hard-deletes obsolete runs and expires old cursors", async () => {
  const store = new InMemoryStore();
  const owner = await store.openOwner({ ownerId: "retention-owner", leaseMs: 10_000 });
  const agent = await owner.reserveAgent({ idempotencyKey: "retention-agent" });
  await owner.activateAgent(agent.id, token, "revision-config");
  const run = await owner.createRun({ agentId: agent.id, input: "old", idempotencyKey: "retention-run" });
  const claimed = await owner.claimRun({ runId: run.id, expectedRevision: run.revision, configToken: token });
  const target = claimed.history[0]!;
  await owner.commitOutcome({
    runId: run.id,
    execution: claimed.execution,
    expectedRevision: claimed.run.revision,
    outcome: { id: "retention-outcome" as never, message: "old answer" },
  });
  const revised = await owner.reviseMessage({
    agentId: agent.id,
    messageId: target.id,
    expectedMessageRevision: 0,
    content: "new",
    operationId: "retention-edit",
  });
  const replacement = await owner.claimRun({
    runId: revised.replacementRun.id,
    expectedRevision: revised.replacementRun.revision,
    configToken: token,
  });
  await owner.commitOutcome({
    runId: replacement.run.id,
    execution: replacement.execution,
    expectedRevision: replacement.run.revision,
    outcome: { id: "retention-outcome-new" as never, message: "new answer" },
  });
  const events = await owner.listEvents();
  const lastCursor = events.at(-1)!.cursor;
  await owner.advanceConsumerCheckpoint({ consumerId: "retention-consumer", cursor: lastCursor });
  const compacted = await owner.compact({
    now: "2999-01-01T00:00:00.000Z",
    retentionMs: 0,
  });
  expect(compacted.deletedRunIds).toContain(run.id);
  expect(compacted.deletedEventCount).toBeGreaterThan(0);
  await expect(owner.listEvents({ after: events[0]!.cursor })).rejects.toMatchObject({
    code: "invalid_cursor",
    details: { reason: "expired" },
  });
  expect((await owner.history(agent.id)).map((message) => message.content)).toEqual(["new"]);
});
