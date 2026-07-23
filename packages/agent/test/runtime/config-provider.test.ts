import { expect, test } from "bun:test";
import {
  ConfigCommandService,
  InMemoryConfigProvider,
  InMemoryStore,
  RuntimeError,
  brandConfigToken,
  pageAgents,
  pageRuns,
} from "../../src/runtime";
import type { AgentConfig, AgentRecord, RunRecord } from "../../src/runtime/contracts";
import type { AgentId, RunId } from "../../src/runtime-events";

function config(identity: string): AgentConfig {
  return {
    identity,
    model: { provider: "test", id: "model" },
    stream: async () => undefined,
    context: { systemPrompt: "system", tools: [], skills: [] },
  } as unknown as AgentConfig;
}

test("InMemoryConfigProvider retains immutable Tokens and replays operation IDs", async () => {
  const provider = new InMemoryConfigProvider();
  const agentId = "agent-1" as AgentId;
  const first = await provider.put({ agentId, config: config("v1"), operationId: "op-1", signal: new AbortController().signal });
  const replay = await provider.put({ agentId, config: config("v1"), operationId: "op-1", signal: new AbortController().signal });
  expect(replay).toEqual(first);
  expect(await provider.put({ agentId, config: config("v2"), operationId: "op-1", signal: new AbortController().signal })).toEqual({ kind: "identity_conflict" });
  const token = brandConfigToken((first as { kind: "stored"; token: string }).token);
  expect(await provider.resolve({ agentId, token, signal: new AbortController().signal })).toMatchObject({ kind: "available", config: { identity: "v1" } });
  expect(() => brandConfigToken("")).toThrow();
});

test("ConfigCommandService provisions and updates an Agent atomically", async () => {
  const store = new InMemoryStore();
  const owned = await store.openOwner({ ownerId: "owner-1", leaseMs: 10_000 });
  const provider = new InMemoryConfigProvider();
  const commands = new ConfigCommandService(owned, provider, "store-1");
  const id = await commands.createAgent({ config: config("v1"), metadata: { title: "demo" }, idempotencyKey: "create-1" });
  expect(await commands.createAgent({ config: config("v1"), metadata: { title: "demo" }, idempotencyKey: "create-1" })).toBe(id);
  await expect(commands.createAgent({ config: config("v2"), metadata: { title: "demo" }, idempotencyKey: "create-1" })).rejects.toMatchObject({ code: "idempotency_conflict" });
  await commands.updateAgentConfig({ agentId: id, config: config("v2"), idempotencyKey: "update-1" });
  const agent = (await owned.listAgents()).find((candidate) => candidate.id === id)!;
  expect(agent.currentConfigIdentity).toBe("v2");
  await owned.sealAndReleaseOwner();
});

test("Agent and Run read-model cursors bind Store, collection, and filter", () => {
  const agents: AgentRecord[] = [
    { id: "a-1" as AgentId, createdAt: "2026-01-01", activatedAt: "2026-01-01", updatedAt: "2026-01-01" },
    { id: "a-2" as AgentId, createdAt: "2026-01-02", activatedAt: "2026-01-02", updatedAt: "2026-01-02" },
  ];
  const first = pageAgents(agents, { storeIncarnation: "store-1", limit: 1 });
  expect(first.items).toHaveLength(1);
  expect(first.next).toBeDefined();
  expect(pageAgents(agents, { storeIncarnation: "store-1", after: first.next, limit: 1 }).items[0]?.id).toBe("a-2" as AgentId);
  expect(() => pageAgents(agents, { storeIncarnation: "store-2", after: first.next })).toThrow(new RuntimeError("invalid_cursor", { cursorType: "agent_list", reason: "wrong_store" }));

  const runs: RunRecord[] = [
    { id: "r-1" as RunId, agentId: "a-1" as AgentId, agentSequence: 0, readySequence: 0, revision: 0, state: "queued", input: "one", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    { id: "r-2" as RunId, agentId: "a-1" as AgentId, agentSequence: 1, readySequence: 1, revision: 0, state: "completed", input: "two", createdAt: "2026-01-02", updatedAt: "2026-01-02" },
  ];
  expect(pageRuns(runs, { storeIncarnation: "store-1", states: ["queued"] }).items).toHaveLength(1);
  expect(() => pageRuns(runs, { storeIncarnation: "store-1", states: ["failed"], after: first.next as never })).toThrow();
});
