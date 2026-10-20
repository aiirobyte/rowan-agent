import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StreamFn } from "@rowan-agent/models";
import { AgentRuntime, InMemoryStore, SqliteStore } from "../../src/runtime/index";
import type { DurableStore } from "../../src/runtime/index";
import { loadExtensionFromFactory } from "../../src/extensions/loader";
import type { Phase } from "../../src/harness/phases/types";
import type { AgentId, Message } from "../../src/runtime-events";
import { createAgentWith, createPhaseAgent } from "../fixtures/configuration";
import { stopResponse } from "./route-test-utils";

const idle: StreamFn = async function* () {
  throw new Error("the model should not be called");
};

/** A Phase that waits on one Interaction per id and completes with the answers it received. */
function askPhase(...ids: string[]): Phase {
  return {
    name: "ask",
    description: "Ask",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Ask",
    isolated: false,
    run: async (_context, execution) => {
      for (const id of ids) execution.interaction.request({ id, kind: "user_input", prompt: `Question ${id}` });
      if (execution.interaction.pending().length > 0) execution.interaction.suspend();
      return { message: "done", route: "stop", payload: Object.fromEntries(execution.interaction.answers()) as never };
    },
  };
}

async function waiting(runtime: AgentRuntime, name: string, ...ids: string[]) {
  const phase = askPhase(...ids);
  const agentId = await createPhaseAgent(runtime, {
    identity: `${name}-v1`,
    stream: idle,
    phases: { phases: new Map([[phase.name, phase]]), entryPhaseId: phase.name },
    options: { idempotencyKey: `${name}-agent` },
  });
  const run = await runtime.start(agentId, "hello", { idempotencyKey: `${name}-run` });
  await run.wait();
  return { agentId, run };
}

const interactionsOf = (history: readonly Message[]) =>
  history.flatMap((message) => (message.role === "interaction" ? [message] : []));

test("an answered Interaction keeps the host metadata and the raiser still gets only the input", async () => {
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const { agentId, run } = await waiting(runtime, "answered", "a", "b");
    await run.respondInteraction({ interactionId: "a", input: "yes", metadata: { answeredBy: "alice" } });
    await run.respondInteraction({ interactionId: "b", cancel: true, metadata: { answeredBy: "bob" } });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    await expect(run.snapshot()).resolves.toMatchObject({ outcome: { payload: { a: "yes" } } });
    expect(interactionsOf(await runtime.history(agentId))).toMatchObject([
      { interactionId: "a", status: "answered", answer: "yes", answerMetadata: { answeredBy: "alice" } },
      { interactionId: "b", status: "cancelled", answerMetadata: { answeredBy: "bob" } },
    ]);
  } finally {
    await runtime.close();
  }
});

test("a new input replies to every open Interaction with its own metadata", async () => {
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const { agentId, run } = await waiting(runtime, "replied", "a", "b");
    // A child report resuming a waiting parent arrives as exactly this kind of input.
    const metadata = { kind: "rowan.child-outcome", childAgentId: "agent_child" };
    await runtime.start(agentId, { content: "child finished", metadata }, { idempotencyKey: "replied-report" });
    await run.wait();
    expect(interactionsOf(await runtime.history(agentId))).toMatchObject([
      { interactionId: "a", status: "replied", reply: "child finished", answerMetadata: metadata },
      { interactionId: "b", status: "replied", reply: "child finished", answerMetadata: metadata },
    ]);
  } finally {
    await runtime.close();
  }
});

test("a live Interaction publishes the answer metadata and invalid metadata is rejected", async () => {
  const extension = loadExtensionFromFactory((api) => {
    api.tools.register({
      name: "approval_tool",
      description: "Requires host approval",
      parameters: { type: "object", properties: {} },
      execute: async () => ({ content: [{ type: "text", text: "ok" }] }),
    });
    api.hooks.on("before_tool_call", (event) =>
      event.answer === "allow" ? { allow: true } : { interaction: { kind: "permission", prompt: "Allow?" } });
  }, process.cwd(), "<test:answer-metadata>");
  const stream: StreamFn = async function* (_request, ctx) {
    await (ctx as any).tools.call("approval_tool", {});
    yield { type: "done", response: stopResponse("done") };
  };
  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
    bootstrap: async (registry) => { await registry.loadExtensions([extension]); },
  });
  try {
    const agentId = await createAgentWith(runtime, { identity: "live-v1", stream, options: { idempotencyKey: "live-agent" } });
    const run = await runtime.start(agentId, "go", { idempotencyKey: "live-run" });
    const boundary = await run.wait();
    if (boundary.type !== "input_required") throw new Error("Expected held input.");
    const interactionId = boundary.interactions[0]!.id;
    await expect(run.respondInteraction({ interactionId, input: "allow", metadata: [] as never }))
      .rejects.toThrow("metadata");
    await run.respondInteraction({ interactionId, input: "allow", metadata: { answeredBy: "alice" } });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(interactionsOf(await runtime.history(agentId))).toMatchObject([
      { answer: "allow", answerMetadata: { answeredBy: "alice" } },
    ]);
  } finally {
    await runtime.close();
  }
});

test("answer and reply metadata survive reopening both durable stores", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rowan-answer-metadata-"));
  try {
    for (const [name, store] of [["memory", new InMemoryStore()], ["sqlite", new SqliteStore(join(directory, "runtime.sqlite"))]] as [string, DurableStore][]) {
      let agentId: AgentId;
      const first = await AgentRuntime.init({ store, concurrency: 1 });
      try {
        const waited = await waiting(first, name, "a", "b");
        agentId = waited.agentId;
        await waited.run.respondInteraction({ interactionId: "a", input: "yes", metadata: { answeredBy: "alice" } });
        await first.start(agentId, { content: "later", metadata: { from: "child" } }, { idempotencyKey: `${name}-reply` });
        await waited.run.wait();
      } finally {
        await first.close();
      }
      const second = await AgentRuntime.init({ store, concurrency: 1 });
      try {
        expect(interactionsOf(await second.history(agentId!))).toMatchObject([
          { interactionId: "a", status: "answered", answerMetadata: { answeredBy: "alice" } },
          { interactionId: "b", status: "replied", reply: "later", answerMetadata: { from: "child" } },
        ]);
      } finally {
        await second.close();
        if (store instanceof SqliteStore) store.close();
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("respondInteraction rejects non-object metadata", async () => {
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const { run } = await waiting(runtime, "invalid", "a");
    await expect(run.respondInteraction({ interactionId: "a", input: "yes", metadata: "alice" as never })).rejects.toThrow("metadata");
    await expect(run.snapshot()).resolves.toMatchObject({ state: "input_required", interactions: [{ id: "a", status: "pending" }] });
  } finally {
    await runtime.close();
  }
});
