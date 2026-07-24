import { expect, test } from "bun:test";
import { InMemoryStore } from "../../src/runtime";
import type { ExecutionId, MessageId, ToolCallId } from "../../src/runtime-events";

test("DurableStore persists Tool pending → running → terminal lifecycle", async () => {
  const store = new InMemoryStore();
  const owner = await store.openOwner({ ownerId: "owner-tools", leaseMs: 10_000 });
  const agent = await owner.reserveAgent({ idempotencyKey: "agent-tools" });
  const run = await owner.createRun({ agentId: agent.id, input: "hello", idempotencyKey: "run-tools" });
  const claim = await owner.claimRun({
    runId: run.id,
    expectedRevision: run.revision,
    executionId: "exec-tools" as ExecutionId,
  });
  const toolCallId = "provider-tool-1" as ToolCallId;
  const reserved = await owner.reserveToolCall({
    runId: run.id,
    execution: claim.execution,
    expectedRevision: claim.run.revision,
    requestMessageId: "assistant-request-1" as MessageId,
    toolCallId,
    name: "lookup",
    args: { query: "rowan" },
  });
  expect(reserved.toolCall).toMatchObject({ id: toolCallId, state: "pending", name: "lookup" });

  const reservedReplay = await owner.reserveToolCall({
    runId: run.id,
    execution: claim.execution,
    expectedRevision: claim.run.revision,
    requestMessageId: "assistant-request-1" as MessageId,
    toolCallId,
    name: "lookup",
    args: { query: "rowan" },
  });
  expect(reservedReplay).toEqual(reserved);

  const started = await owner.startToolCall({
    runId: run.id,
    execution: claim.execution,
    expectedRevision: reserved.run.revision,
    toolCallId,
  });
  expect(started.toolCall.state).toBe("running");

  const completed = await owner.commitToolResult({
    runId: run.id,
    execution: claim.execution,
    expectedRevision: started.run.revision,
    toolCallId,
    state: "completed",
    result: { ok: true, content: { value: 42 } },
  });
  expect(completed.toolCall).toMatchObject({ state: "completed", result: { ok: true, toolName: "lookup" } });
  expect((await owner.snapshotRun(run.id)).toolCallCount).toBe(1);
  expect((await owner.listEvents()).map((event) => event.kind)).toEqual([
    "run_state_changed",
    "message_committed",
    "run_state_changed",
    "message_committed",
    "tool_state_changed",
    "tool_state_changed",
    "tool_state_changed",
    "message_committed",
  ]);
});

test("DurableStore records policy rejection as a failed pending ToolCall", async () => {
  const owner = await new InMemoryStore().openOwner({ ownerId: "owner-tools", leaseMs: 10_000 });
  const agent = await owner.reserveAgent({ idempotencyKey: "agent-policy" });
  const run = await owner.createRun({ agentId: agent.id, input: "hello", idempotencyKey: "run-policy" });
  const claim = await owner.claimRun({ runId: run.id, expectedRevision: run.revision, executionId: "exec-policy" as ExecutionId });
  const reserved = await owner.reserveToolCall({
    runId: run.id,
    execution: claim.execution,
    expectedRevision: claim.run.revision,
    requestMessageId: "assistant-request-policy" as MessageId,
    toolCallId: "provider-tool-policy" as ToolCallId,
    name: "delete",
    args: {},
  });
  const failed = await owner.commitToolResult({
    runId: run.id,
    execution: claim.execution,
    expectedRevision: reserved.run.revision,
    toolCallId: reserved.toolCall.id,
    state: "failed",
    result: { ok: false, content: null, error: "denied" },
  });
  expect(failed.toolCall).toMatchObject({ state: "failed", result: { error: "denied" } });
  expect((await owner.listEvents()).at(-2)).toMatchObject({
    kind: "tool_state_changed",
    transition: { from: "pending", to: "failed" },
  });
});

test("DurableStore marks running Tools indeterminate when an owner is interrupted", async () => {
  const store = new InMemoryStore();
  const owner = await store.openOwner({ ownerId: "owner-tools", leaseMs: 10_000 });
  const agent = await owner.reserveAgent({ idempotencyKey: "agent-interrupt" });
  const run = await owner.createRun({ agentId: agent.id, input: "hello", idempotencyKey: "run-interrupt" });
  const claim = await owner.claimRun({ runId: run.id, expectedRevision: run.revision, executionId: "exec-interrupt" as ExecutionId });
  const reserved = await owner.reserveToolCall({
    runId: run.id,
    execution: claim.execution,
    expectedRevision: claim.run.revision,
    requestMessageId: "assistant-request-interrupt" as MessageId,
    toolCallId: "provider-tool-interrupt" as ToolCallId,
    name: "wait",
    args: {},
  });
  await owner.startToolCall({ runId: run.id, execution: claim.execution, expectedRevision: reserved.run.revision, toolCallId: reserved.toolCall.id });
  store.interruptOwner(owner.lease.epoch, "owner stopped");
  expect(await owner.snapshotRun(run.id)).toMatchObject({
    state: "failed",
    failure: { code: "tool_indeterminate", toolCallIds: [reserved.toolCall.id] },
    toolCallCount: 1,
  });
});

test("DurableStore turns cancellation with a running Tool into tool_indeterminate", async () => {
  const store = new InMemoryStore();
  const owner = await store.openOwner({ ownerId: "owner-tools", leaseMs: 10_000 });
  const agent = await owner.reserveAgent({ idempotencyKey: "agent-cancel" });
  const run = await owner.createRun({ agentId: agent.id, input: "hello", idempotencyKey: "run-cancel" });
  const claim = await owner.claimRun({ runId: run.id, expectedRevision: run.revision, executionId: "exec-cancel" as ExecutionId });
  const reserved = await owner.reserveToolCall({
    runId: run.id,
    execution: claim.execution,
    expectedRevision: claim.run.revision,
    requestMessageId: "assistant-request-cancel" as MessageId,
    toolCallId: "provider-tool-cancel" as ToolCallId,
    name: "wait",
    args: {},
  });
  const started = await owner.startToolCall({ runId: run.id, execution: claim.execution, expectedRevision: reserved.run.revision, toolCallId: reserved.toolCall.id });
  const cancelled = await owner.cancelRun({ runId: run.id, expectedRevision: started.run.revision, reason: "user cancelled" });
  expect(cancelled).toMatchObject({ state: "failed", failure: { code: "tool_indeterminate", toolCallIds: [reserved.toolCall.id] } });
});
