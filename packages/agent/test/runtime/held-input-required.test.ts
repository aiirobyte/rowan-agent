import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StreamFn } from "@rowan-agent/models";
import {
  AgentRuntime,
  InMemoryConfigProvider,
  InMemoryStore,
  SqliteStore,
  type DurableStore,
  type ExecutionToken,
} from "../../src/runtime/index";
import type { OwnedStore } from "../../src/runtime/contracts";
import { RunInteractionCancelledError } from "../../src/index";
import type { AgentId, RunId } from "../../src/runtime-events";
import type { RunInteraction } from "../../src/harness/phases/interactions";
import { createAgentWith } from "../fixtures/configuration";
import { stopResponse } from "./route-test-utils";

type StoreCase = Readonly<{
  name: string;
  open(): Promise<Readonly<{
    store: DurableStore;
    owner: OwnedStore;
    dispose(): Promise<void>;
  }>>;
}>;

async function withStores(run: (name: string, owner: OwnedStore) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "rowan-held-input-"));
  const cases: StoreCase[] = [
    {
      name: "memory",
      open: async () => {
        const store = new InMemoryStore();
        const owner = await store.openOwner({ ownerId: "owner-memory", leaseMs: 10_000 });
        return { store, owner, dispose: () => owner.sealAndReleaseOwner() };
      },
    },
    {
      name: "sqlite",
      open: async () => {
        const store = new SqliteStore(join(directory, "runtime.sqlite"));
        const owner = await store.openOwner({ ownerId: "owner-sqlite", leaseMs: 10_000 });
        return {
          store,
          owner,
          dispose: async () => {
            await owner.sealAndReleaseOwner().catch(() => undefined);
            store.close();
          },
        };
      },
    },
  ];
  try {
    for (const entry of cases) {
      const opened = await entry.open();
      try {
        await run(entry.name, opened.owner);
      } finally {
        await opened.dispose();
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function interaction(id: string, prompt = `Question ${id}`, payload?: RunInteraction["payload"]): RunInteraction {
  return {
    id,
    phase: "ignored",
    kind: "user_input",
    prompt,
    ...(payload === undefined ? {} : { payload }),
    createdAt: new Date().toISOString(),
    status: "pending",
  };
}

async function running(
  owner: OwnedStore,
  name: string,
  options: { phase?: string; control?: boolean } = {},
): Promise<Readonly<{ agentId: AgentId; runId: RunId; execution: ExecutionToken; revision: number }>> {
  const agent = await owner.reserveAgent({ idempotencyKey: `${name}-agent` });
  await owner.activateAgent(agent.id);
  const run = await owner.createRun({
    agentId: agent.id,
    input: "hello",
    ...(options.control ? { metadata: { rowan: { kind: "phase", phase: "compact" } } } : {}),
    idempotencyKey: `${name}-run`,
  });
  const claim = await owner.claimRun({ runId: run.id, expectedRevision: run.revision });
  if (options.phase) {
    const entered = await owner.commitPhaseEntered({
      runId: run.id,
      execution: claim.execution,
      expectedRevision: claim.run.revision,
      phaseId: options.phase,
      visit: 1,
    });
    return { agentId: agent.id, runId: run.id, execution: claim.execution, revision: entered.revision };
  }
  return { agentId: agent.id, runId: run.id, execution: claim.execution, revision: claim.run.revision };
}

test("held raise durably enters input_required with the current Phase and keeps its execution", async () => {
  await withStores(async (name, owner) => {
    const held = await running(owner, `${name}-raise`, { phase: "implementation" });
    const raised = await owner.raiseInteraction({
      runId: held.runId,
      execution: held.execution,
      expectedRevision: held.revision,
      interaction: interaction("approval"),
    });

    expect(raised.run).toMatchObject({
      state: "input_required",
      execution: { executionId: held.execution.executionId, ownerEpoch: held.execution.ownerEpoch },
      openInteractions: [{ id: "approval", phase: "implementation", status: "pending" }],
    });
    expect(await owner.snapshotRun(held.runId)).toMatchObject({
      state: "input_required",
      currentPhaseId: "implementation",
      interactions: [{ id: "approval", phase: "implementation" }],
    });
  });
});

test("a held Run accepts same-execution writes while held and rejects another execution", async () => {
  await withStores(async (name, owner) => {
    const held = await running(owner, `${name}-writes`, { phase: "work" });
    const raised = await owner.raiseInteraction({
      runId: held.runId,
      execution: held.execution,
      expectedRevision: held.revision,
      interaction: interaction("approval"),
    });
    const parallel = await owner.commitPhaseOutput({
      runId: held.runId,
      execution: held.execution,
      expectedRevision: raised.run.revision,
      message: {
        id: `assistant-${name}` as never,
        agentId: held.agentId,
        runId: held.runId,
        role: "assistant",
        content: "parallel output",
        sequenceWithinRun: 0,
        createdAt: new Date().toISOString(),
      },
    });
    expect(parallel.state).toBe("input_required");
    expect((await owner.snapshotRun(held.runId)).messageCount).toBe(2);

    await expect(owner.commitPhaseOutput({
      runId: held.runId,
      execution: { ...held.execution, executionId: "foreign-execution" as never },
      expectedRevision: parallel.revision,
      message: {
        id: `assistant-foreign-${name}` as never,
        agentId: held.agentId,
        runId: held.runId,
        role: "assistant",
        content: "foreign output",
        sequenceWithinRun: 0,
        createdAt: new Date().toISOString(),
      },
    })).rejects.toMatchObject({ code: "runtime_ownership_lost" });
    expect(await owner.snapshotRun(held.runId)).toMatchObject({ state: "input_required", messageCount: 2 });
  });
});

test("held phase, Tool, and final-outcome writes from the owning execution are accepted", async () => {
  await withStores(async (name, owner) => {
    const held = await running(owner, `${name}-owning-writes`, { phase: "work" });
    const raised = await owner.raiseInteraction({
      runId: held.runId,
      execution: held.execution,
      expectedRevision: held.revision,
      interaction: interaction("approval"),
    });
    const entered = await owner.commitPhaseEntered({
      runId: held.runId,
      execution: held.execution,
      expectedRevision: raised.run.revision,
      phaseId: "review",
      visit: 2,
    });
    expect(entered).toMatchObject({ state: "input_required", currentPhaseId: "review" });

    const reserved = await owner.reserveToolCall({
      runId: held.runId,
      execution: held.execution,
      expectedRevision: entered.revision,
      requestMessageId: `request-${name}` as never,
      toolCallId: `tool-${name}` as never,
      name: "lookup",
      args: { query: "while-held" },
    });
    const completedTool = await owner.commitToolResult({
      runId: held.runId,
      execution: held.execution,
      expectedRevision: reserved.run.revision,
      toolCallId: reserved.toolCall.id,
      state: "completed",
      result: { ok: true, content: "found" },
    });
    expect(completedTool.run.state).toBe("input_required");
    const completed = await owner.commitOutcome({
      runId: held.runId,
      execution: held.execution,
      expectedRevision: completedTool.run.revision,
      outcome: { id: `outcome-${name}` as never, message: "finished" },
    });
    expect(completed).toMatchObject({ state: "completed" });
    expect(completed.openInteractions).toBeUndefined();
    expect(completed.execution).toBeUndefined();
  });
});

test("a second held Interaction is appended, and only the last answer returns the Run to running", async () => {
  await withStores(async (name, owner) => {
    const held = await running(owner, `${name}-second`, { phase: "work" });
    const first = await owner.raiseInteraction({
      runId: held.runId,
      execution: held.execution,
      expectedRevision: held.revision,
      interaction: interaction("first"),
    });
    const second = await owner.raiseInteraction({
      runId: held.runId,
      execution: held.execution,
      expectedRevision: first.run.revision,
      interaction: interaction("second"),
    });
    expect(second.run).toMatchObject({
      state: "input_required",
      execution: held.execution,
      openInteractions: [{ id: "first" }, { id: "second" }],
    });
    const appended = (await owner.listEvents())
      .filter((event) => event.runId === held.runId && event.kind === "run_state_changed")
      .at(-1);
    expect(appended).toMatchObject({
      from: "input_required",
      to: "input_required",
      interactions: [{ id: "first" }, { id: "second" }],
    });

    const answeredFirst = await owner.answerInteraction({
      runId: held.runId,
      interactionId: "first",
      expectedRevision: second.run.revision,
      input: "one",
    });
    expect(answeredFirst).toMatchObject({
      state: "input_required",
      execution: held.execution,
      openInteractions: [{ id: "second" }],
    });
    const answeredLast = await owner.answerInteraction({
      runId: held.runId,
      interactionId: "second",
      expectedRevision: answeredFirst.revision,
      input: "two",
    });
    expect(answeredLast).toMatchObject({ state: "running", execution: held.execution });
    expect(answeredLast.openInteractions).toBeUndefined();
  });
});

test("a Control Run cannot claim while an input_required Run still owns an execution", async () => {
  await withStores(async (name, owner) => {
    const held = await running(owner, `${name}-control-held`, { phase: "work" });
    await owner.raiseInteraction({
      runId: held.runId,
      execution: held.execution,
      expectedRevision: held.revision,
      interaction: interaction("approval"),
    });
    const control = await owner.createRun({
      agentId: held.agentId,
      input: "",
      metadata: { rowan: { kind: "phase", phase: "compact" } },
      idempotencyKey: `${name}-control-run`,
    });
    await expect(owner.claimRun({
      runId: control.id,
      expectedRevision: control.revision,
    })).rejects.toMatchObject({ code: "run_state_conflict" });
  });
});

test("owner recovery keeps held Interactions, drops the dead execution, and answering queues the Run", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rowan-held-recovery-"));
  try {
    const memory = new InMemoryStore();
    const firstMemory = await memory.openOwner({ ownerId: "memory-before", leaseMs: 10_000 });
    const memoryHeld = await running(firstMemory, "memory-recovery", { phase: "work" });
    await firstMemory.raiseInteraction({
      runId: memoryHeld.runId,
      execution: memoryHeld.execution,
      expectedRevision: memoryHeld.revision,
      interaction: interaction("approval", "Continue?", { target: "prod" }),
    });
    await firstMemory.sealAndReleaseOwner();
    const secondMemory = await memory.openOwner({ ownerId: "memory-after", leaseMs: 10_000 });
    expect((await secondMemory.listRuns()).find(({ id }) => id === memoryHeld.runId)).toMatchObject({
      state: "input_required",
      openInteractions: [{ id: "approval", payload: { target: "prod" } }],
    });
    expect((await secondMemory.listRuns()).find(({ id }) => id === memoryHeld.runId)?.execution).toBeUndefined();
    expect(await secondMemory.answerInteraction({
      runId: memoryHeld.runId,
      interactionId: "approval",
      expectedRevision: (await secondMemory.snapshotRun(memoryHeld.runId)).revision,
      input: "yes",
    })).toMatchObject({ state: "queued" });
    await secondMemory.sealAndReleaseOwner();

    const filename = join(directory, "runtime.sqlite");
    const firstStore = new SqliteStore(filename);
    const firstSqlite = await firstStore.openOwner({ ownerId: "sqlite-before", leaseMs: 10_000 });
    const sqliteHeld = await running(firstSqlite, "sqlite-recovery", { phase: "work" });
    await firstSqlite.raiseInteraction({
      runId: sqliteHeld.runId,
      execution: sqliteHeld.execution,
      expectedRevision: sqliteHeld.revision,
      interaction: interaction("approval", "Continue?", { target: "prod" }),
    });
    await firstSqlite.sealAndReleaseOwner();
    firstStore.close();

    const secondStore = new SqliteStore(filename);
    try {
      const secondSqlite = await secondStore.openOwner({ ownerId: "sqlite-after", leaseMs: 10_000 });
      expect((await secondSqlite.listRuns()).find(({ id }) => id === sqliteHeld.runId)).toMatchObject({
        state: "input_required",
        openInteractions: [{ id: "approval", payload: { target: "prod" } }],
      });
      expect((await secondSqlite.listRuns()).find(({ id }) => id === sqliteHeld.runId)?.execution).toBeUndefined();
      expect(await secondSqlite.answerInteraction({
        runId: sqliteHeld.runId,
        interactionId: "approval",
        expectedRevision: (await secondSqlite.snapshotRun(sqliteHeld.runId)).revision,
        input: "yes",
      })).toMatchObject({ state: "queued" });
      await secondSqlite.sealAndReleaseOwner();
    } finally {
      secondStore.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

const waitingStream = (seen: string[]): StreamFn => async function* (_request, rawCtx) {
  const answer = await (rawCtx as any).interact({
    id: "approval",
    kind: "permission",
    prompt: "Allow?",
    payload: { target: "prod" },
  });
  seen.push(String(answer));
  yield { type: "done", response: stopResponse("done") };
};

async function eventually<T>(read: () => T | undefined, timeoutMs = 2_000): Promise<T> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = read();
    if (value !== undefined) return value;
    await Bun.sleep(10);
  }
  throw new Error("Timed out waiting for state.");
}

test("answering a held Interaction returns the Run to running and resolves the waiting call", async () => {
  const answers: string[] = [];
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await createAgentWith(runtime, {
      identity: "held-answer-v1",
      stream: waitingStream(answers),
      options: { idempotencyKey: "held-answer-agent" },
    });
    const run = await runtime.start(agentId, "go", { idempotencyKey: "held-answer-run" });
    const boundary = await run.wait();
    if (boundary.type !== "input_required") throw new Error("Expected held input.");
    await run.respondInteraction({ interactionId: boundary.interactions[0]!.id, input: "allow" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(answers).toEqual(["allow"]);
  } finally {
    await runtime.close();
  }
});

test("a new input replies to a held wait, returns the Run to running, and rejects the call with the reply", async () => {
  const store = new InMemoryStore();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let repliedError: unknown;
  const stream: StreamFn = async function* (_request, rawCtx) {
    try {
      await (rawCtx as any).interact({ id: "approval", kind: "permission", prompt: "Allow?" });
    } catch (error) {
      repliedError = error;
    }
    await gate;
    yield { type: "done", response: stopResponse("done") };
  };
  const runtime = await AgentRuntime.init({ store, concurrency: 1 });
  try {
    const agentId = await createAgentWith(runtime, {
      identity: "held-reply-v1",
      stream,
      options: { idempotencyKey: "held-reply-agent" },
    });
    const run = await runtime.start(agentId, "go", { idempotencyKey: "held-reply-run" });
    const boundary = await run.wait();
    if (boundary.type !== "input_required") throw new Error("Expected held input.");

    const replied = await runtime.start(agentId, "I changed my mind", { idempotencyKey: "held-reply-message" });
    expect(replied.id).toBe(run.id);
    await eventually(() => repliedError);
    expect(repliedError).toBeInstanceOf(RunInteractionCancelledError);
    expect((repliedError as Error).message).toBe("The user replied instead: I changed my mind");
    expect(store.exportState().runs.find(({ id }) => id === run.id)).toMatchObject({
      state: "running",
      execution: expect.any(Object),
    });
    release();
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect((await runtime.history(agentId)).find((message) => message.role === "interaction")).toMatchObject({
      interactionId: "approval",
      status: "replied",
      reply: "I changed my mind",
    });
  } finally {
    await runtime.close();
  }
});

test("cancelling a held Run aborts its execution, rejects the waiter, and clears the execution token", async () => {
  const store = new InMemoryStore();
  const runtime = await AgentRuntime.init({ store, concurrency: 1 });
  try {
    const agentId = await createAgentWith(runtime, {
      identity: "held-cancel-v1",
      stream: waitingStream([]),
      options: { idempotencyKey: "held-cancel-agent" },
    });
    const run = await runtime.start(agentId, "go", { idempotencyKey: "held-cancel-run" });
    const boundary = await run.wait();
    if (boundary.type !== "input_required") throw new Error("Expected held input.");
    const held = store.exportState().runs.find(({ id }) => id === run.id)!;
    const executionId = held.execution!.executionId;

    await expect(run.cancel("stop now")).resolves.toMatchObject({ type: "cancelled" });
    const cancelled = store.exportState().runs.find(({ id }) => id === run.id)!;
    expect(cancelled.state).toBe("cancelled");
    expect(cancelled.execution).toBeUndefined();
    expect(store.exportState().operationReceipts.map(([key]) => key)).not.toContain(`claim:${executionId}`);
  } finally {
    await runtime.close();
  }
});

test("a lost held execution replays and auto-answers a matching Interaction fingerprint", async () => {
  const store = new InMemoryStore();
  const configs = new InMemoryConfigProvider();
  const answers: string[] = [];
  const stream = waitingStream(answers);
  const first = await AgentRuntime.init({ store, configs, concurrency: 1 });
  let runId: RunId | undefined;
  let agentId: AgentId | undefined;
  let second: AgentRuntime | undefined;
  try {
    agentId = await createAgentWith(first, {
      identity: "held-replay-v1",
      stream,
      options: { idempotencyKey: "held-replay-agent" },
    });
    const run = await first.start(agentId, "go", { idempotencyKey: "held-replay-run" });
    runId = run.id;
    const boundary = await run.wait();
    if (boundary.type !== "input_required") throw new Error("Expected held input.");

    const inspectable = first as unknown as {
      heartbeat?: ReturnType<typeof setInterval>;
      executions: Map<RunId, { controller: AbortController }>;
      owned: { renewOwner(leaseMs: number): Promise<unknown> };
    };
    if (inspectable.heartbeat) clearInterval(inspectable.heartbeat);
    await inspectable.owned.renewOwner(20);
    await Bun.sleep(40);

    second = await AgentRuntime.init({ store, configs, concurrency: 1 });
    expect(await second.snapshot(runId)).toMatchObject({ state: "input_required", interactions: [{ id: "approval" }] });
    inspectable.executions.get(runId)?.controller.abort(new Error("simulated crashed owner"));

    await second.respondInteraction(runId, {
      interactionId: boundary.interactions[0]!.id,
      input: "allow",
    });
    await expect(second.run(runId).wait()).resolves.toMatchObject({ type: "completed" });
    expect(answers).toEqual(["allow"]);
    const events = (await (second as any).owned.listEvents()) as Array<{ runId: RunId; kind: string; to?: string }>;
    expect(events.filter((event) => event.runId === runId && event.kind === "run_state_changed" && event.to === "input_required")).toHaveLength(1);
  } finally {
    await second?.close();
  }
});

