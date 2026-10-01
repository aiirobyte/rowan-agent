import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StreamFn } from "@rowan-agent/models";
import { AgentRuntime, InMemoryStore, SqliteStore } from "../../src/runtime";
import type { ContextCompactionRecord } from "../../src/runtime/contracts";
import type { Phase } from "../../src/harness/phases/types";
import { createPhaseAgent } from "../fixtures/configuration";
import { stopResponse } from "./route-test-utils";

function isCompactionPrompt(messages: readonly { content: unknown }[]): boolean {
  return messages.some((message) =>
    typeof message.content === "string" && message.content.includes('<phase_content name="compact">'));
}

class CommitSpy {
  count = 0;
  record: ContextCompactionRecord | undefined;
  reset(): void {
    this.count = 0;
    this.record = undefined;
  }
}

test("compact as single entry Phase commits a compaction", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rowan-compact-single-"));
  try {
    const stream: StreamFn = async function* (input) {
      const isCompaction = isCompactionPrompt(input.messages);
      const text = isCompaction ? "Single entry summary" : "Regular assistant reply";
      yield { type: "text_delta", text, partial: { role: "assistant", contentBlocks: [{ type: "text", text }] } };
      yield { type: "done", response: stopResponse(text) };
    };

    const store = new InMemoryStore();
    const spy = new CommitSpy();
    const origCommit = store.commitContextCompaction.bind(store);
    store.commitContextCompaction = (lease, record) => {
      spy.count++;
      spy.record = record;
      return origCommit(lease, record);
    };

    const runtime = await AgentRuntime.init({ store, concurrency: 1 });
    try {
      const agentId = await createPhaseAgent(runtime, {
        identity: "compact-single-entry-agent",
        stream,
        phases: {
          phases: new Map(),
          entryPhaseId: "compact",
        },
        options: { idempotencyKey: "compact-single-agent" },
      });

      // Normal run where entryPhaseId is configured as "compact"
      const run = await runtime.start(agentId, "Please compact the session", {
        idempotencyKey: "compact-single-run",
      });
      const boundary = await run.wait();
      expect(boundary.type).toBe("completed");

      // Verify compaction was committed
      expect(spy.count).toBe(1);
      expect(spy.record).toBeDefined();
      expect(spy.record?.summary).toBe("Single entry summary");
      expect(spy.record?.coveredThrough).toBeDefined();

      const status = await runtime.contextStatus(agentId);
      expect(status.coveredThrough?.messageId).toBe(spy.record?.coveredThrough?.messageId);
    } finally {
      await runtime.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("compact in a 2-entry parallel fan-out commits one compaction with coveredThrough = pre-Run history", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rowan-compact-fanout-"));
  try {
    const stream: StreamFn = async function* (input) {
      const isCompaction = isCompactionPrompt(input.messages);
      const text = isCompaction ? "Fanout compact summary" : "Join reply";
      yield { type: "text_delta", text, partial: { role: "assistant", contentBlocks: [{ type: "text", text }] } };
      yield { type: "done", response: stopResponse(text) };
    };

    const workerB: Phase = {
      name: "worker-b",
      description: "Worker B sibling",
      filePath: "<test>",
      baseDir: "<test>",
      content: "Worker B content",
      run: async () => ({
        message: "Worker B done",
        payload: { workerResult: "b-data" },
      }),
    };

    const joinPhase: Phase = {
      name: "join-phase",
      description: "Join Phase",
      filePath: "<test>",
      baseDir: "<test>",
      content: "Join content",
      run: async () => {
        return { message: "Joined successfully", route: "stop" };
      },
    };

    const store = new InMemoryStore();
    const spy = new CommitSpy();
    const origCommit = store.commitContextCompaction.bind(store);
    store.commitContextCompaction = (lease, record) => {
      spy.count++;
      spy.record = record;
      return origCommit(lease, record);
    };

    const runtime = await AgentRuntime.init({ store, concurrency: 2 });
    try {
      const agentId = await createPhaseAgent(runtime, {
        identity: "compact-fanout-agent",
        stream,
        phases: {
          phases: new Map([
            [workerB.name, workerB],
            [joinPhase.name, joinPhase],
          ]),
          entryPhaseId: joinPhase.name,
        },
        options: { idempotencyKey: "compact-fanout-agent" },
      });

      // Prior Turn 1: establish pre-Run conversation history
      const priorRun = await runtime.start(agentId, "Turn 1 prior message", {
        idempotencyKey: "prior-turn-run",
      });
      await expect(priorRun.wait()).resolves.toMatchObject({ type: "completed" });

      // Reset commit spy for Turn 2
      spy.reset();

      // Turn 2: 2-entry parallel fan-out with compact and worker-b
      const fanoutRun = await runtime.start(agentId, "Turn 2 fanout request", {
        idempotencyKey: "fanout-compact-run",
        entryPhases: [
          { phase: "compact" },
          { phase: "worker-b" },
        ],
      });

      const boundary = await fanoutRun.wait();
      expect(boundary.type).toBe("completed");

      // Exactly ONE compaction committed
      expect(spy.count).toBe(1);
      expect(spy.record).toBeDefined();
      expect(spy.record?.summary).toBe("Fanout compact summary");

      // coveredThrough matches the last message that existed when the Run started
      // (the initial user message created when fanoutRun was claimed)
      const allHistory = await runtime.history(agentId);
      const fanoutUserMessage = allHistory.find((m) => m.runId === fanoutRun.id && m.role === "user")!;
      expect(spy.record?.coveredThrough).toBeDefined();
      expect(spy.record?.coveredThrough?.messageId).toBe(fanoutUserMessage.id);
      expect(spy.record?.coveredThrough?.sequence).toBe(fanoutUserMessage.sequenceWithinRun);

      // Verify sibling worker-b and join-phase messages (sequence > coveredThrough) are preserved and not swallowed
      const laterMessages = allHistory.filter((m) => m.runId === fanoutRun.id && m.sequenceWithinRun > fanoutUserMessage.sequenceWithinRun);
      expect(laterMessages.length).toBeGreaterThan(0);

      // Verify context status reflects the compaction
      const status = await runtime.contextStatus(agentId);
      expect(status.coveredThrough?.messageId).toBe(fanoutUserMessage.id);
    } finally {
      await runtime.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("control compact Run still commits exactly once", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rowan-control-compact-"));
  try {
    const stream: StreamFn = async function* (input) {
      const isCompaction = isCompactionPrompt(input.messages);
      const text = isCompaction ? "Control compact summary" : "Normal greeting reply";
      yield { type: "text_delta", text, partial: { role: "assistant", contentBlocks: [{ type: "text", text }] } };
      yield { type: "done", response: stopResponse(text) };
    };

    const store = new InMemoryStore();
    const spy = new CommitSpy();
    const origCommit = store.commitContextCompaction.bind(store);
    store.commitContextCompaction = (lease, record) => {
      spy.count++;
      spy.record = record;
      return origCommit(lease, record);
    };

    const runtime = await AgentRuntime.init({ store, concurrency: 1 });
    try {
      const agentId = await createPhaseAgent(runtime, {
        identity: "control-compact-agent",
        stream,
        phases: {
          phases: new Map(),
          entryPhaseId: "default",
        },
        options: { idempotencyKey: "control-compact-agent" },
      });

      // Establish conversation history
      const initialRun = await runtime.start(agentId, "Hello agent", {
        idempotencyKey: "initial-run",
      });
      await expect(initialRun.wait()).resolves.toMatchObject({ type: "completed" });
      const historyBefore = await runtime.history(agentId);

      // Reset commit spy
      spy.reset();

      // Run control compact Run
      const compactRun = await runtime.compactContext(agentId, {
        input: "/compact Focus on key decisions",
        idempotencyKey: "manual-control-compact",
      });
      await expect(compactRun.wait()).resolves.toMatchObject({ type: "completed" });

      // Must commit EXACTLY ONCE (no double-commit)
      expect(spy.count).toBe(1);
      expect(spy.record).toBeDefined();
      expect(spy.record?.summary).toBe("Control compact summary");
      expect(spy.record?.instructions).toBe("Focus on key decisions");

      // Verify coveredThrough covers through the manual compact input
      const historyAfter = await runtime.history(agentId);
      expect(historyAfter).toHaveLength(historyBefore.length + 1);
      expect(spy.record?.coveredThrough?.messageId).toBe(historyAfter.at(-1)?.id);

      const status = await runtime.contextStatus(agentId);
      expect(status.coveredThrough?.messageId).toBe(historyAfter.at(-1)?.id);
    } finally {
      await runtime.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("compact in parallel fan-out on SqliteStore commits one compaction with pre-Run history", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rowan-sqlite-compact-"));
  const dbPath = join(directory, "store.sqlite");
  try {
    const stream: StreamFn = async function* (input) {
      const isCompaction = isCompactionPrompt(input.messages);
      const text = isCompaction ? "Sqlite compact summary" : "Regular reply";
      yield { type: "text_delta", text, partial: { role: "assistant", contentBlocks: [{ type: "text", text }] } };
      yield { type: "done", response: stopResponse(text) };
    };

    const workerB: Phase = {
      name: "worker-b",
      description: "Worker B",
      filePath: "<test>",
      baseDir: "<test>",
      content: "Worker B",
      run: async () => ({ message: "B done", payload: { ok: true } }),
    };

    const joinPhase: Phase = {
      name: "join-phase",
      description: "Join",
      filePath: "<test>",
      baseDir: "<test>",
      content: "Join",
      run: async () => ({ message: "Joined", route: "stop" }),
    };

    const store = new SqliteStore(dbPath);
    const spy = new CommitSpy();
    const origCommit = store.commitContextCompaction.bind(store);
    store.commitContextCompaction = async (lease, record) => {
      spy.count++;
      spy.record = record;
      return origCommit(lease, record);
    };

    const runtime = await AgentRuntime.init({ store, concurrency: 2 });
    try {
      const agentId = await createPhaseAgent(runtime, {
        identity: "sqlite-compact-agent",
        stream,
        phases: {
          phases: new Map([
            [workerB.name, workerB],
            [joinPhase.name, joinPhase],
          ]),
          entryPhaseId: joinPhase.name,
        },
        options: { idempotencyKey: "sqlite-compact-agent" },
      });

      // Prior message
      const priorRun = await runtime.start(agentId, "Prior sqlite turn", {
        idempotencyKey: "sqlite-prior-run",
      });
      await expect(priorRun.wait()).resolves.toMatchObject({ type: "completed" });

      // Reset spy
      spy.reset();

      // Parallel fan-out with compact
      const fanout = await runtime.start(agentId, "Sqlite fanout turn", {
        idempotencyKey: "sqlite-fanout-run",
        entryPhases: [
          { phase: "compact" },
          { phase: "worker-b" },
        ],
      });
      await expect(fanout.wait()).resolves.toMatchObject({ type: "completed" });

      expect(spy.count).toBe(1);
      expect(spy.record?.summary).toBe("Sqlite compact summary");

      const allHistory = await runtime.history(agentId);
      const fanoutUserMessage = allHistory.find((m) => m.runId === fanout.id && m.role === "user")!;
      expect(spy.record?.coveredThrough?.messageId).toBe(fanoutUserMessage.id);

      const status = await runtime.contextStatus(agentId);
      expect(status.coveredThrough?.messageId).toBe(fanoutUserMessage.id);
    } finally {
      await runtime.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("compact as route target mid-Run commits a compaction", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rowan-compact-route-"));
  try {
    const stream: StreamFn = async function* (input) {
      const isCompaction = isCompactionPrompt(input.messages);
      const text = isCompaction ? "Mid-run compact summary" : "Initial reply";
      yield { type: "text_delta", text, partial: { role: "assistant", contentBlocks: [{ type: "text", text }] } };
      yield { type: "done", response: stopResponse(text) };
    };

    const starterPhase: Phase = {
      name: "starter",
      description: "Starter phase that routes to compact",
      filePath: "<test>",
      baseDir: "<test>",
      content: "Starter content",
      run: async () => ({
        message: "Routing to compact",
        route: "compact",
      }),
    };

    const store = new InMemoryStore();
    const spy = new CommitSpy();
    const origCommit = store.commitContextCompaction.bind(store);
    store.commitContextCompaction = (lease, record) => {
      spy.count++;
      spy.record = record;
      return origCommit(lease, record);
    };

    const runtime = await AgentRuntime.init({ store, concurrency: 1 });
    try {
      const agentId = await createPhaseAgent(runtime, {
        identity: "compact-route-agent",
        stream,
        phases: {
          phases: new Map([[starterPhase.name, starterPhase]]),
          entryPhaseId: starterPhase.name,
        },
        options: { idempotencyKey: "compact-route-agent" },
      });

      const run = await runtime.start(agentId, "Trigger compaction via route", {
        idempotencyKey: "route-compact-run",
      });
      await expect(run.wait()).resolves.toMatchObject({ type: "completed" });

      expect(spy.count).toBe(1);
      expect(spy.record?.summary).toBe("Mid-run compact summary");
      const status = await runtime.contextStatus(agentId);
      expect(status.coveredThrough?.messageId).toBe(spy.record?.coveredThrough?.messageId);
    } finally {
      await runtime.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
