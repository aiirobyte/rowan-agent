import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteStore } from "../../src/runtime";
import type { ConfigToken, ExecutionId, OutcomeId } from "../../src/runtime-events";

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
    const claim = await first.claimRun({ runId: run.id, expectedRevision: 0, executionId: "exec-1" as ExecutionId });
    await new Promise((resolve) => setTimeout(resolve, 40));

    const secondStore = new SqliteStore(filename);
    try {
      const second = await secondStore.openOwner({ ownerId: "owner-2", leaseMs: 10_000 });
      expect(second.lease.epoch).toBe(first.lease.epoch + 1);
      expect(await second.listAgents()).toHaveLength(1);
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
