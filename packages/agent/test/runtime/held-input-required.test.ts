import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StreamFn } from "@rowan-agent/models";
import {
  AgentRuntime,
  InMemoryStore,
  SqliteStore,
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
    store: InMemoryStore | SqliteStore;
    owner: OwnedStore;
    dispose(): Promise<void>;
  }>>;
}>;

async function withStores(run: (name: string, owner: OwnedStore, store: InMemoryStore | SqliteStore) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "rowan-held-input-"));
  const cases: StoreCase[] = [
    {
      name: "memory",
      open: async () => {
        const store = new InMemoryStore();
        const owner = await store.openOwner({ ownerId: "owner-memory", leaseMs: 10_000 });
        return { store, owner, dispose: () => owner.sealAndReleaseOwner().catch(() => undefined) };
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
        await run(entry.name, opened.owner, opened.store);
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

test("owner loss during a held Tool Call fails the Run, cancels the Interaction, and closes the Tool Call", async () => {
  await withStores(async (name, owner, store) => {
    const held = await running(owner, `${name}-owner-loss`, { phase: "work" });
    const reserved = await owner.reserveToolCall({
      runId: held.runId,
      execution: held.execution,
      expectedRevision: held.revision,
      requestMessageId: `request-${name}` as never,
      toolCallId: `tool-${name}` as never,
      name: "write_file",
      args: { path: "secrets.txt" },
    });
    const started = await owner.startToolCall({
      runId: held.runId,
      execution: held.execution,
      expectedRevision: reserved.run.revision,
      toolCallId: reserved.toolCall.id,
    });
    await owner.raiseInteraction({
      runId: held.runId,
      execution: held.execution,
      expectedRevision: started.run.revision,
      interaction: {
        ...interaction("approval", "Allow writing secrets.txt?"),
        toolCallId: started.toolCall.id,
      },
    });

    await owner.sealAndReleaseOwner();
    const recovered = await store.openOwner({ ownerId: `${name}-after`, leaseMs: 10_000 });
    const snapshot = await recovered.snapshotRun(held.runId);
    expect(snapshot).toMatchObject({
      state: "failed",
      failure: {
        code: "tool_indeterminate",
        message: "The Runtime owner was sealed.",
        toolCallIds: [reserved.toolCall.id],
      },
    });
    expect((await recovered.history(held.agentId)).find((message) =>
      message.role === "interaction" && message.interactionId === "approval"
    )).toMatchObject({
      status: "cancelled",
      toolCallId: reserved.toolCall.id,
    });
    const toolCall = store.exportState().toolCalls.find(({ id }) => id === reserved.toolCall.id);
    expect(toolCall).toMatchObject({ status: "failed", state: "failed" });
    expect(store.exportState().toolCalls.filter((candidate) =>
      candidate.runId === held.runId
      && (candidate.status === "pending" || candidate.status === "in_progress"
        || candidate.state === "pending" || candidate.state === "in_progress")
    )).toEqual([]);
    expect((await recovered.listEvents()).filter((event) =>
      event.runId === held.runId
      && event.kind === "run_state_changed"
      && event.from === "input_required"
      && event.to === "failed"
    )).toHaveLength(1);
    await recovered.sealAndReleaseOwner();
  });
});

test("a suspended input_required Run survives owner loss and answering it queues the Run", async () => {
  await withStores(async (name, owner, store) => {
    const claimed = await running(owner, `${name}-suspended`, { phase: "work" });
    const waiting = await owner.commitInputRequired({
      runId: claimed.runId,
      execution: claimed.execution,
      expectedRevision: claimed.revision,
      phase: "work",
      prompt: {
        id: `prompt-${name}` as never,
        agentId: claimed.agentId,
        runId: claimed.runId,
        role: "assistant",
        content: "Continue?",
        sequenceWithinRun: 1,
        createdAt: new Date().toISOString(),
      },
      checkpoint: { codec: "rowan.agent.execution", version: 1, data: { phase: "work" } },
      interactions: [interaction("approval", "Continue?")],
    });
    expect(waiting.state).toBe("input_required");
    expect(waiting.execution).toBeUndefined();

    await owner.sealAndReleaseOwner();
    const recovered = await store.openOwner({ ownerId: `${name}-after`, leaseMs: 10_000 });
    expect((await recovered.listRuns()).find(({ id }) => id === claimed.runId)).toMatchObject({
      state: "input_required",
      openInteractions: [{ id: "approval", status: "pending" }],
    });
    expect((await recovered.listRuns()).find(({ id }) => id === claimed.runId)?.execution).toBeUndefined();
    const answered = await recovered.answerInteraction({
      runId: claimed.runId,
      interactionId: "approval",
      expectedRevision: (await recovered.snapshotRun(claimed.runId)).revision,
      input: "yes",
    });
    expect(answered.state).toBe("queued");
    expect(answered.execution).toBeUndefined();
    await recovered.sealAndReleaseOwner();
  });
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
