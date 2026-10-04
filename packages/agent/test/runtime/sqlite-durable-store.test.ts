import { expect, spyOn, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteStore } from "../../src/runtime";
import type { ConfigToken, ExecutionId, MessageId, OutcomeId, ToolCallId } from "../../src/runtime-events";

async function tableCatalog(filename: string): Promise<string[]> {
  const database = new Database(filename, { create: true, readwrite: true, strict: true });
  try {
    return (database.query(
      "SELECT name FROM sqlite_master WHERE type IN ('table', 'index') AND name NOT LIKE 'sqlite_%' ORDER BY name",
    ).all() as Array<{ name: string }>).map((row) => row.name);
  } finally {
    database.close();
  }
}

test("SQLite DurableStore construction does not initialize schema", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rowan-durable-sqlite-"));
  const filename = join(directory, "runtime.sqlite");
  try {
    const store = new SqliteStore(filename);
    expect(await tableCatalog(filename)).toEqual([]);
    store.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("SQLite DurableStore initializes an empty database only in openOwner", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rowan-durable-sqlite-"));
  const filename = join(directory, "runtime.sqlite");
  try {
    const store = new SqliteStore(filename);
    const owner = await store.openOwner({ ownerId: "owner-1", leaseMs: 10_000 });
    expect(await tableCatalog(filename)).toContain("runtime_meta");
    expect(await tableCatalog(filename)).not.toContain("runtime_schema");
    await owner.sealAndReleaseOwner();
    store.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("SQLite DurableStore rejects unsupported non-empty databases without mutation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rowan-durable-sqlite-"));
  const filename = join(directory, "legacy.sqlite");
  try {
    const legacy = new Database(filename, { create: true, readwrite: true, strict: true });
    legacy.run("CREATE TABLE runtime_schema (version INTEGER PRIMARY KEY NOT NULL)");
    legacy.run("INSERT INTO runtime_schema (version) VALUES (2)");
    legacy.close();
    const before = await readFile(filename);
    const store = new SqliteStore(filename);
    await expect(store.openOwner({ ownerId: "owner-1", leaseMs: 10_000 })).rejects.toMatchObject({ code: "unsupported_store_version" });
    store.close();
    expect(await tableCatalog(filename)).toEqual(["runtime_schema"]);
    expect(await readFile(filename)).toEqual(before);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("SQLite DurableStore allows one live owner and replays the same Owner ID", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rowan-durable-sqlite-"));
  const filename = join(directory, "owners.sqlite");
  const firstStore = new SqliteStore(filename);
  const secondStore = new SqliteStore(filename);
  try {
    const first = await firstStore.openOwner({ ownerId: "owner-1", leaseMs: 10_000 });
    const replay = await secondStore.openOwner({ ownerId: "owner-1", leaseMs: 10_000 });
    expect(replay.lease).toMatchObject({ token: first.lease.token, epoch: first.lease.epoch, ownerId: "owner-1" });
    await expect(secondStore.openOwner({ ownerId: "owner-2", leaseMs: 10_000 })).rejects.toMatchObject({ code: "runtime_already_owned" });
    await replay.sealAndReleaseOwner();
    await expect(first.listAgents()).rejects.toMatchObject({ code: "runtime_ownership_lost" });
  } finally {
    firstStore.close();
    secondStore.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("SQLite DurableStore lists materialized Events without hydrating aggregate state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rowan-durable-sqlite-"));
  const filename = join(directory, "events.sqlite");
  const store = new SqliteStore(filename);
  try {
    const owner = await store.openOwner({ ownerId: "owner-events", leaseMs: 10_000 });
    const agent = await owner.reserveAgent({ idempotencyKey: "agent-events" });
    await owner.createRun({ agentId: agent.id, input: "hello", idempotencyKey: "run-events" });

    const parse = spyOn(JSON, "parse");
    try {
      const events = await owner.listEvents();
      expect(events.length).toBeGreaterThan(0);
      expect(await owner.listEvents({ after: events[0]!.cursor })).toEqual(events.slice(1));
      expect(parse.mock.calls.some(([value]) =>
        typeof value === "string" && value.includes("\"incarnation\":")
      )).toBeFalse();
      await expect(owner.listEvents({ after: "another-store:0" as never })).rejects.toMatchObject({
        code: "invalid_cursor",
        details: { reason: "wrong_store" },
      });
      const incarnation = String(events[0]!.cursor).split(":")[0]!;
      await expect(owner.listEvents({ after: `${incarnation}:999` as never })).rejects.toMatchObject({
        code: "invalid_cursor",
        details: { reason: "beyond_waterline" },
      });
    } finally {
      parse.mockRestore();
    }
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("SQLite DurableStore mirrors semantic Events to an owner-only session archive", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rowan-durable-mirror-"));
  const filename = join(directory, "runtime.sqlite");
  const store = new SqliteStore(filename);
  try {
    const owner = await store.openOwner({ ownerId: "owner-mirror", leaseMs: 10_000 });
    const agent = await owner.reserveAgent({ idempotencyKey: "agent-mirror" });
    const run = await owner.createRun({ agentId: agent.id, input: "hello", idempotencyKey: "run-mirror" });
    await owner.claimRun({ runId: run.id, expectedRevision: run.revision, executionId: "exec-mirror" as ExecutionId });
    const sessionPath = join(directory, "context-archives", String(agent.id), "session.jsonl");
    const session = await readFile(sessionPath, "utf8");
    expect(session).toContain('"kind":"rowan_event"');
    expect(session).toContain('"message_committed"');
    expect(session.split("\n").filter(Boolean).length).toBeGreaterThanOrEqual(2);
    await owner.sealAndReleaseOwner();
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("SQLite DurableStore persists domain state and fences expired executions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rowan-durable-sqlite-"));
  const filename = join(directory, "restart.sqlite");
  const firstStore = new SqliteStore(filename);
  try {
    const first = await firstStore.openOwner({ ownerId: "owner-1", leaseMs: 20 });
    const agent = await first.reserveAgent({ idempotencyKey: "agent-1", metadata: { name: "persisted" } });
    await first.activateAgent(agent.id);
    await first.updateAgentConfigToken({ agentId: agent.id, token: "cfg-1" as ConfigToken, idempotencyKey: "config-1" });
    const run = await first.createRun({ agentId: agent.id, input: "hello", idempotencyKey: "run-1" });
    const claim = await first.claimRun({
      runId: run.id,
      expectedRevision: 0,
      executionId: "exec-1" as ExecutionId,
    });
    await expect(first.history(agent.id)).resolves.toMatchObject([
      { role: "user", content: "hello" },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 40));

    const secondStore = new SqliteStore(filename);
    try {
      const second = await secondStore.openOwner({ ownerId: "owner-2", leaseMs: 10_000 });
      expect(second.lease.epoch).toBe(first.lease.epoch + 1);
      expect(await second.listAgents()).toHaveLength(1);
      await expect(second.history(agent.id)).resolves.toMatchObject([
        { role: "user", content: "hello" },
      ]);
      expect(await second.snapshotRun(run.id)).toMatchObject({ state: "failed", failure: { code: "runtime_interrupted" } });
      await expect(first.commitOutcome({
        runId: run.id,
        execution: claim.execution,
        expectedRevision: claim.run.revision,
        outcome: { id: "outcome-1" as OutcomeId, message: "late" },
      })).rejects.toMatchObject({ code: "runtime_ownership_lost" });
      await second.sealAndReleaseOwner();
    } finally {
      secondStore.close();
    }
  } finally {
    firstStore.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("SQLite DurableStore renews an expired lease until another owner claims it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rowan-durable-sqlite-"));
  const filename = join(directory, "renew-expired.sqlite");
  const store = new SqliteStore(filename);
  try {
    const owner = await store.openOwner({ ownerId: "owner-1", leaseMs: 20 });
    await new Promise((resolve) => setTimeout(resolve, 40));

    const renewed = await owner.renewOwner(10_000);

    expect(renewed).toMatchObject({
      ownerId: "owner-1",
      epoch: owner.lease.epoch,
      token: owner.lease.token,
    });
    await expect(owner.listAgents()).resolves.toEqual([]);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("SQLite DurableStore assigns terminal message sequence after durable Tool messages", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rowan-durable-sqlite-"));
  const filename = join(directory, "tool-terminal.sqlite");
  const store = new SqliteStore(filename);
  try {
    const owner = await store.openOwner({ ownerId: "owner-tool-terminal", leaseMs: 10_000 });
    const agent = await owner.reserveAgent({ idempotencyKey: "agent-tool-terminal" });
    const run = await owner.createRun({ agentId: agent.id, input: "hello", idempotencyKey: "run-tool-terminal" });
    const claim = await owner.claimRun({ runId: run.id, expectedRevision: run.revision, executionId: "exec-tool-terminal" as ExecutionId });
    const reserved = await owner.reserveToolCall({
      runId: run.id,
      execution: claim.execution,
      expectedRevision: claim.run.revision,
      requestMessageId: "assistant-tool-request" as MessageId,
      toolCallId: "tool-terminal" as ToolCallId,
      name: "lookup",
      args: {},
    });
    const started = await owner.startToolCall({
      runId: run.id,
      execution: claim.execution,
      expectedRevision: reserved.run.revision,
      toolCallId: reserved.toolCall.id,
    });
    const completed = await owner.commitToolResult({
      runId: run.id,
      execution: claim.execution,
      expectedRevision: started.run.revision,
      toolCallId: reserved.toolCall.id,
      state: "completed",
      result: { ok: true, content: "done" },
    });

    await owner.commitOutcome({
      runId: run.id,
      execution: claim.execution,
      expectedRevision: completed.run.revision,
      outcome: { id: "outcome-tool-terminal" as OutcomeId, message: "finished" },
      output: {
        id: "assistant-terminal" as MessageId,
        agentId: agent.id,
        runId: run.id,
        role: "assistant",
        content: "finished",
        sequenceWithinRun: 1,
        createdAt: new Date().toISOString(),
      },
    });

    const inputRun = await owner.createRun({ agentId: agent.id, input: "ask", idempotencyKey: "run-tool-input" });
    const inputClaim = await owner.claimRun({ runId: inputRun.id, expectedRevision: inputRun.revision, executionId: "exec-tool-input" as ExecutionId });
    const inputReserved = await owner.reserveToolCall({
      runId: inputRun.id,
      execution: inputClaim.execution,
      expectedRevision: inputClaim.run.revision,
      requestMessageId: "assistant-input-tool-request" as MessageId,
      toolCallId: "tool-input" as ToolCallId,
      name: "lookup",
      args: {},
    });
    const inputStarted = await owner.startToolCall({
      runId: inputRun.id,
      execution: inputClaim.execution,
      expectedRevision: inputReserved.run.revision,
      toolCallId: inputReserved.toolCall.id,
    });
    const inputCompleted = await owner.commitToolResult({
      runId: inputRun.id,
      execution: inputClaim.execution,
      expectedRevision: inputStarted.run.revision,
      toolCallId: inputReserved.toolCall.id,
      state: "completed",
      result: { ok: true, content: "done" },
    });
    const suspended = await owner.commitInputRequired({
      runId: inputRun.id,
      execution: inputClaim.execution,
      expectedRevision: inputCompleted.run.revision,
      phase: "plan",
      prompt: {
        id: "assistant-input-required" as MessageId,
        agentId: agent.id,
        runId: inputRun.id,
        role: "assistant",
        content: "Continue?",
        sequenceWithinRun: 1,
        createdAt: new Date().toISOString(),
      },
      checkpoint: { codec: "test", version: 1, data: {} },
    });
    const promptMessage = (await owner.contextMessages(agent.id)).find((m) => m.id === "assistant-input-required");
    expect(promptMessage?.sequenceWithinRun).toBe(3);

    const database = new Database(filename, { readwrite: true, strict: true });
    try {
      expect(database.query("SELECT sequence_within_run AS sequence FROM messages WHERE run_id = ? ORDER BY sequence").all(run.id))
        .toEqual([{ sequence: 0 }, { sequence: 1 }, { sequence: 2 }, { sequence: 3 }]);
      expect(database.query("SELECT sequence_within_run AS sequence FROM messages WHERE run_id = ? ORDER BY sequence").all(inputRun.id))
        .toEqual([{ sequence: 0 }, { sequence: 1 }, { sequence: 2 }, { sequence: 3 }]);
    } finally {
      database.close();
    }
    await owner.sealAndReleaseOwner();
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("SqliteStore persists entryPhases and round-trips across store reopen", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rowan-sqlite-entry-phases-"));
  const filename = join(directory, "runtime.sqlite");
  try {
    const store1 = new SqliteStore(filename);
    let runId: string;
    const entryPhases = [
      { phase: "review", payload: { depth: 2 } },
      { phase: "plan" },
    ];
    try {
      const owner1 = await store1.openOwner({ ownerId: "owner-1", leaseMs: 10_000 });
      const agent = await owner1.reserveAgent({ idempotencyKey: "agent-sqlite-fanout" });
      await owner1.activateAgent(agent.id);

      const run = await owner1.createRun({
        agentId: agent.id,
        input: "fan out work",
        entryPhases,
        idempotencyKey: "run-sqlite-fanout",
      });
      runId = run.id;
      expect(run.entryPhases).toEqual(entryPhases);

      const snap1 = await owner1.snapshotRun(run.id);
      expect(snap1.entryPhases).toEqual(entryPhases);

      await owner1.sealAndReleaseOwner();
    } finally {
      store1.close();
    }

    const store2 = new SqliteStore(filename);
    try {
      const owner2 = await store2.openOwner({ ownerId: "owner-2", leaseMs: 10_000 });
      const snap2 = await owner2.snapshotRun(runId as never);
      expect(snap2.entryPhases).toEqual(entryPhases);
      await owner2.sealAndReleaseOwner();
    } finally {
      store2.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("SQLite DurableStore read operations do not reparse state while owner lease is held", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rowan-durable-sqlite-"));
  const filename = join(directory, "read-cache.sqlite");
  const store = new SqliteStore(filename);
  try {
    const owner = await store.openOwner({ ownerId: "owner-1", leaseMs: 10_000 });
    const agent = await owner.reserveAgent({ idempotencyKey: "agent-1" });
    const run = await owner.createRun({ agentId: agent.id, input: "hello", idempotencyKey: "run-1" });

    const readStateSpy = spyOn(store as any, "readState");
    expect(readStateSpy).toHaveBeenCalledTimes(0);

    // Perform multiple read operations
    await owner.snapshotRun(run.id);
    await owner.history(agent.id);
    await owner.listRuns();
    await owner.listAgents();
    await owner.contextStatus(agent.id, 8000);
    await owner.contextMessages(agent.id);
    await owner.openConsumer("consumer-1");
    await owner.listEvents();

    expect(readStateSpy).toHaveBeenCalledTimes(0);
    readStateSpy.mockRestore();

    await owner.sealAndReleaseOwner();
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("SQLite DurableStore incremental persist survives reopen with identical exported state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rowan-durable-sqlite-"));
  const filename = join(directory, "reopen-parity.sqlite");
  const store1 = new SqliteStore(filename);
  let exportedBefore: any;
  try {
    const owner1 = await store1.openOwner({ ownerId: "owner-1", leaseMs: 10_000 });
    const agent = await owner1.reserveAgent({ idempotencyKey: "agent-reopen" });
    await owner1.activateAgent(agent.id);
    const run = await owner1.createRun({
      agentId: agent.id,
      input: "test input",
      idempotencyKey: "run-reopen",
    });
    const claim = await owner1.claimRun({ runId: run.id, expectedRevision: run.revision });
    const reserved = await owner1.reserveToolCall({
      runId: run.id,
      execution: claim.execution,
      expectedRevision: claim.run.revision,
      requestMessageId: "msg-tool-req" as MessageId,
      toolCallId: "tool-call-1" as ToolCallId,
      name: "calculator",
      args: { a: 1, b: 2 },
    });
    const started = await owner1.startToolCall({
      runId: run.id,
      execution: claim.execution,
      expectedRevision: reserved.run.revision,
      toolCallId: reserved.toolCall.id,
    });
    const completed = await owner1.commitToolResult({
      runId: run.id,
      execution: claim.execution,
      expectedRevision: started.run.revision,
      toolCallId: reserved.toolCall.id,
      result: { ok: true, content: { answer: 3 } },
      state: "completed",
    });
    await owner1.commitOutcome({
      runId: run.id,
      execution: claim.execution,
      expectedRevision: completed.run.revision,
      outcome: { id: "out-1" as OutcomeId, message: "done" },
    });
    const consumer = await owner1.openConsumer("c-1");
    await owner1.advanceConsumerCheckpoint({
      consumerId: "c-1",
      cursor: consumer.waterline,
    });

    exportedBefore = store1.exportState();
    await owner1.sealAndReleaseOwner();
  } finally {
    store1.close();
  }

  const store2 = new SqliteStore(filename);
  try {
    const owner2 = await store2.openOwner({ ownerId: "owner-2", leaseMs: 10_000 });
    const exportedAfter = store2.exportState();

    expect(exportedAfter.agents.length).toBe(exportedBefore.agents.length);
    expect(exportedAfter.runs.length).toBe(exportedBefore.runs.length);
    expect(exportedAfter.messages.length).toBe(exportedBefore.messages.length);
    expect(exportedAfter.toolCalls.length).toBe(exportedBefore.toolCalls.length);
    expect(exportedAfter.events.length).toBe(exportedBefore.events.length);
    expect(exportedAfter.consumerCheckpoints).toEqual(exportedBefore.consumerCheckpoints);

    expect(exportedAfter.agents).toEqual(exportedBefore.agents);
    expect(exportedAfter.runs).toEqual(exportedBefore.runs);
    expect(exportedAfter.messages).toEqual(exportedBefore.messages);
    expect(exportedAfter.toolCalls).toEqual(exportedBefore.toolCalls);
    expect(exportedAfter.events).toEqual(exportedBefore.events);

    await owner2.sealAndReleaseOwner();
  } finally {
    store2.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("SQLite DurableStore failed write leaves no in-memory divergence from disk", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rowan-durable-sqlite-"));
  const filename = join(directory, "failed-write.sqlite");
  const store = new SqliteStore(filename);
  try {
    const owner = await store.openOwner({ ownerId: "owner-1", leaseMs: 10_000 });
    const agent = await owner.reserveAgent({ idempotencyKey: "agent-fail" });
    const run = await owner.createRun({ agentId: agent.id, input: "ok", idempotencyKey: "run-fail" });

    const claim = await owner.claimRun({ runId: run.id, expectedRevision: run.revision });
    await expect(
      owner.commitOutcome({
        runId: run.id,
        execution: claim.execution,
        expectedRevision: 9999,
        outcome: { id: "out-bad" as OutcomeId, message: "bad" },
      }),
    ).rejects.toThrow();

    const snap = await owner.snapshotRun(run.id);
    expect(snap.state).toBe("running");
    expect(snap.revision).toBe(claim.run.revision);

    await owner.sealAndReleaseOwner();
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("SQLite DurableStore drops operation receipts for terminal runs and compacts on openOwner", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rowan-durable-sqlite-"));
  const filename = join(directory, "terminal-receipts.sqlite");
  const store1 = new SqliteStore(filename);
  try {
    const owner1 = await store1.openOwner({ ownerId: "owner-1", leaseMs: 10_000 });
    const agent = await owner1.reserveAgent({ idempotencyKey: "agent-term" });
    const run1 = await owner1.createRun({ agentId: agent.id, input: "run1", idempotencyKey: "run-term-1" });
    const claim1 = await owner1.claimRun({ runId: run1.id, expectedRevision: run1.revision });
    const reserved1 = await owner1.reserveToolCall({
      runId: run1.id,
      execution: claim1.execution,
      expectedRevision: claim1.run.revision,
      requestMessageId: "msg-term-req" as MessageId,
      toolCallId: "tool-term-1" as ToolCallId,
      name: "search",
      args: { q: "term" },
    });
    const started1 = await owner1.startToolCall({
      runId: run1.id,
      execution: claim1.execution,
      expectedRevision: reserved1.run.revision,
      toolCallId: reserved1.toolCall.id,
    });
    const completed1 = await owner1.commitToolResult({
      runId: run1.id,
      execution: claim1.execution,
      expectedRevision: started1.run.revision,
      toolCallId: reserved1.toolCall.id,
      result: { ok: true, content: "ok" },
      state: "completed",
    });

    let exported = store1.exportState();
    expect(exported.operationReceipts.length).toBeGreaterThan(0);

    // Complete run 1 -> terminal state drops operation receipts
    await owner1.commitOutcome({
      runId: run1.id,
      execution: claim1.execution,
      expectedRevision: completed1.run.revision,
      outcome: { id: "out-done" as OutcomeId, message: "done" },
    });

    exported = store1.exportState();
    const run1Receipts = exported.operationReceipts.filter(([key]) => key.includes(run1.id));
    expect(run1Receipts.length).toBe(0);

    // Artificially insert legacy terminal receipts into sqlite database to simulate bloated DB
    const db = (store1 as any).database as Database;
    for (let i = 0; i < 20; i++) {
      db.run(
        "INSERT INTO idempotency (scope, payload_json, result_json) VALUES (?, ?, ?)",
        [`operation:tool_commit:${run1.id}:extra_${i}`, JSON.stringify([run1.id, i]), JSON.stringify({ cached: true })],
      );
    }
    const countBeforeCompaction = (db.query("SELECT count(*) as count FROM idempotency WHERE scope LIKE 'operation:%'").get() as any).count;
    expect(countBeforeCompaction).toBeGreaterThanOrEqual(20);

    await owner1.sealAndReleaseOwner();
  } finally {
    store1.close();
  }

  // Reopen with store2: openOwner must run compactTerminalReceipts and purge terminal receipts
  const store2 = new SqliteStore(filename);
  try {
    const owner2 = await store2.openOwner({ ownerId: "owner-2", leaseMs: 10_000 });
    const db2 = (store2 as any).database as Database;
    const countAfterCompaction = (db2.query("SELECT count(*) as count FROM idempotency WHERE scope LIKE 'operation:%'").get() as any).count;
    expect(countAfterCompaction).toBe(0);

    await owner2.sealAndReleaseOwner();
  } finally {
    store2.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("SQLite DurableStore allows idempotent replay of live-run receipts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rowan-durable-sqlite-"));
  const filename = join(directory, "replay-receipt.sqlite");
  const store = new SqliteStore(filename);
  try {
    const owner = await store.openOwner({ ownerId: "owner-1", leaseMs: 10_000 });
    const agent = await owner.reserveAgent({ idempotencyKey: "agent-replay" });
    const run = await owner.createRun({ agentId: agent.id, input: "replay test", idempotencyKey: "run-replay" });
    const claim = await owner.claimRun({ runId: run.id, expectedRevision: run.revision });

    const reserved = await owner.reserveToolCall({
      runId: run.id,
      execution: claim.execution,
      expectedRevision: claim.run.revision,
      requestMessageId: "msg-replay-req" as MessageId,
      toolCallId: "tool-replay-1" as ToolCallId,
      name: "read_file",
      args: { path: "foo.txt" },
    });
    const started = await owner.startToolCall({
      runId: run.id,
      execution: claim.execution,
      expectedRevision: reserved.run.revision,
      toolCallId: reserved.toolCall.id,
    });

    const commit1 = await owner.commitToolResult({
      runId: run.id,
      execution: claim.execution,
      expectedRevision: started.run.revision,
      toolCallId: reserved.toolCall.id,
      result: { ok: true, content: "bar" },
      state: "completed",
    });

    const commit2 = await owner.commitToolResult({
      runId: run.id,
      execution: claim.execution,
      expectedRevision: started.run.revision,
      toolCallId: reserved.toolCall.id,
      result: { ok: true, content: "bar" },
      state: "completed",
    });

    expect(commit2).toEqual(commit1);

    await owner.sealAndReleaseOwner();
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("SQLite DurableStore benchmark fixture with 500 receipts and 800 events achieves snapshotRun < 5ms", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rowan-durable-sqlite-"));
  const filename = join(directory, "benchmark-fixture.sqlite");
  const store = new SqliteStore(filename);
  try {
    const owner = await store.openOwner({ ownerId: "owner-bm", leaseMs: 60_000 });
    const agent = await owner.reserveAgent({ idempotencyKey: "agent-bm" });
    const run = await owner.createRun({ agentId: agent.id, input: "bench", idempotencyKey: "run-bm" });

    const db = (store as any).database as Database;
    db.run("BEGIN IMMEDIATE");
    for (let i = 0; i < 800; i++) {
      db.run(
        "INSERT INTO run_events (id, run_id, payload_json, created_at) VALUES (?, ?, ?, ?)",
        [
          `evt_${i}`,
          run.id,
          JSON.stringify({
            id: `evt_${i}`,
            runId: run.id,
            agentId: agent.id,
            sequence: i + 1,
            type: "phase_progress",
            data: { step: i, payload: "x".repeat(200) },
            createdAt: new Date().toISOString(),
          }),
          new Date().toISOString(),
        ],
      );
    }
    for (let i = 0; i < 500; i++) {
      db.run(
        "INSERT INTO idempotency (scope, payload_json, result_json) VALUES (?, ?, ?)",
        [
          `operation:tool_commit:${run.id}:call_${i}`,
          JSON.stringify([run.id, `call_${i}`, "res"]),
          JSON.stringify({ result: { output: "ok", blob: "y".repeat(500) } }),
        ],
      );
    }
    db.run("COMMIT");

    // Invalidate cachedMemory so it reloads with the 800 events and 500 receipts
    (store as any).cachedMemory = undefined;

    // Warmup
    const firstSnap = await owner.snapshotRun(run.id);
    expect(firstSnap.runId).toBe(run.id);

    // Measure snapshotRun latency across 50 iterations
    const iterations = 50;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      await owner.snapshotRun(run.id);
    }
    const totalMs = performance.now() - start;
    const avgMs = totalMs / iterations;

    expect(avgMs).toBeLessThan(5);

    await owner.sealAndReleaseOwner();
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

