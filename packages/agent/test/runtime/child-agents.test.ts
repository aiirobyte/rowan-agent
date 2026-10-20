import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StreamFn } from "@rowan-agent/models";
import { AgentRuntime, InMemoryConfigProvider, InMemoryStore, RunInteractionCancelledError, SqliteStore } from "../../src/runtime/index";
import type { DurableStore } from "../../src/runtime/index";
import type { OwnedStore } from "../../src/runtime/contracts";
import { loadExtensionFromFactory } from "../../src/extensions/loader";
import type { Phase, PhaseExecution } from "../../src/index";
import type { AgentId, Message, RunId } from "../../src/runtime-events";
import { configuration, seedResources, TEST_SOURCE, testDefinition } from "../fixtures/configuration";
import { routeResponse, stopResponse } from "./route-test-utils";

type Delegated = Awaited<ReturnType<PhaseExecution["agents"]["delegate"]>>;

function phase(name: string, run: NonNullable<Phase["run"]>): Phase {
  return { name, description: name, filePath: "<test>", baseDir: "<test>", content: name, isolated: false, run };
}

/** Waits until `read` returns a value, polling the durable runtime. */
async function eventually<T>(read: () => Promise<T | undefined> | T | undefined, timeoutMs = 3000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await read();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw new Error("Timed out waiting for the runtime.");
}

const textStream = (text: string, seen?: string[]): StreamFn => async function* (request) {
  seen?.push(JSON.stringify(request.messages));
  yield { type: "done", response: stopResponse(text) };
};

type Fixture = Awaited<ReturnType<typeof setup>>;

/**
 * A parent whose entry Phase runs `script` (once per Run) and a `child`
 * Definition the script delegates to.
 */
async function setup(options: {
  store?: DurableStore;
  childStream?: StreamFn;
  childPhases?: Phase[];
  parentStream?: StreamFn;
  extensions?: ReturnType<typeof loadExtensionFromFactory>[];
  script?: (execution: PhaseExecution, input: string, runtime: AgentRuntime) => Promise<unknown>;
}) {
  const store = options.store ?? new InMemoryStore();
  const configs = new InMemoryConfigProvider();
  const runtime = await AgentRuntime.init({
    store,
    configs,
    concurrency: 4,
    ...(options.extensions ? { bootstrap: async (registry) => { await registry.loadExtensions(options.extensions!); } } : {}),
  });
  const childPhases = options.childPhases ?? [];
  const launch = phase("launch", async (context, execution) => {
    const input = String(context.execution.input ?? "");
    const result = await options.script?.(execution, input, runtime);
    if (result === "model") return { route: "default" };
    return { message: "launched", route: "stop", payload: (result ?? null) as never };
  });
  const definitions = [
    testDefinition({ name: "parent", phases: { entryPhaseId: "launch", phaseIds: ["launch"] } }),
    testDefinition({
      name: "child",
      ...(childPhases.length > 0
        ? { phases: { entryPhaseId: childPhases[0]!.name, phaseIds: childPhases.map(({ name }) => name) } }
        : {}),
    }),
  ];
  const view = await seedResources(runtime, {
    agents: definitions,
    phases: [launch, ...childPhases],
  });
  const childConfiguration = (identity: string) => configuration({
    identity,
    definition: "child",
    view,
    model: { provider: "test", id: "model" },
    stream: options.childStream ?? textStream("child done"),
  });
  const parentId = await runtime.createAgent(configuration({
    identity: "parent-v1",
    definition: "parent",
    view,
    model: { provider: "test", id: "model" },
    stream: options.parentStream ?? textStream("parent done"),
  }), { idempotencyKey: "parent-agent" });
  let sequence = 0;
  /** Starts a parent Run; its Phase result is the script's return value. */
  const parentRun = async (text: string) => {
    const run = await runtime.start(parentId, text, { idempotencyKey: `parent-run-${++sequence}` });
    const boundary = await run.wait();
    return { run, boundary };
  };
  const restart = () => AgentRuntime.init({
    store,
    configs,
    concurrency: 4,
    bootstrap: async (registry) => {
      if (options.extensions) await registry.loadExtensions(options.extensions);
      await registry.loadAgents({ sourceId: TEST_SOURCE, values: definitions });
      await registry.loadPhases({ sourceId: TEST_SOURCE, values: [launch, ...childPhases] });
    },
  });
  return { runtime, store, parentId, childConfiguration, parentRun, view, restart };
}

async function userMessages(runtime: AgentRuntime, agentId: AgentId): Promise<Message[]> {
  return (await runtime.history(agentId)).filter((message) => message.role === "user");
}

function reportsOf(messages: Message[], kind: string): Array<{ metadata: Record<string, unknown>; content: any }> {
  return messages
    .filter((message) => (message as any).metadata?.kind === kind)
    .map((message) => ({
      metadata: (message as any).metadata,
      content: JSON.parse(String((message as { content: unknown }).content)),
    }));
}

async function settle(ms = 150): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

test("delegating without an agentId creates a child of the current Agent and starts its Run", async () => {
  let delegated: Delegated | undefined;
  const fixture = await setup({
    script: async (execution) => {
      delegated = await execution.agents.delegate({
        create: () => fixture.childConfiguration("child-v1"),
        input: "build it",
        metadata: { tag: "t" },
      });
      return null;
    },
  });
  try {
    await fixture.parentRun("go");
    expect(delegated).toMatchObject({ created: true });
    const child = delegated!;

    const page = await fixture.runtime.listAgents();
    expect(page.items.find(({ id }) => id === child.agentId)).toMatchObject({ parentAgentId: fixture.parentId, metadata: { tag: "t" } });
    expect(page.items.find(({ id }) => id === fixture.parentId)?.parentAgentId).toBeUndefined();

    const childRun = fixture.runtime.run(child.runId);
    await expect(childRun.wait()).resolves.toMatchObject({ type: "completed" });
    await expect(childRun.snapshot()).resolves.toMatchObject({ agentId: child.agentId, metadata: { tag: "t" } });
  } finally {
    await fixture.runtime.close();
  }
});


test("two delegations in one Phase create two children; an explicit idempotencyKey makes a repeat return the first", async () => {
  const results: Delegated[] = [];
  const fixture = await setup({
    script: async (execution) => {
      const create = () => fixture.childConfiguration("child-v1");
      results.push(await execution.agents.delegate({ create, input: "a" }));
      results.push(await execution.agents.delegate({ create, input: "b" }));
      results.push(await execution.agents.delegate({ create, input: "c", idempotencyKey: "same" }));
      results.push(await execution.agents.delegate({ create, input: "c", idempotencyKey: "same" }));
      return null;
    },
  });
  try {
    await fixture.parentRun("go");
    expect(new Set(results.slice(0, 2).map(({ agentId }) => agentId)).size).toBe(2);
    expect(results[3]).toEqual(results[2]!);
  } finally {
    await fixture.runtime.close();
  }
});

test("continuing a settled child starts a new Run that sees the child's history", async () => {
  const seen: string[] = [];
  let first: Delegated | undefined;
  let second: Delegated | undefined;
  const fixture = await setup({
    childStream: textStream("child done", seen),
    script: async (execution, input) => {
      if (input === "go") {
        first = await execution.agents.delegate({ create: () => fixture.childConfiguration("child-v1"), input: "first task" });
      } else {
        second = await execution.agents.delegate({
          agentId: first!.agentId,
          create: () => { throw new Error("create is only for new children"); },
          input: "second task",
        });
      }
      return null;
    },
  });
  try {
    await fixture.parentRun("go");
    await expect(fixture.runtime.run(first!.runId).wait()).resolves.toMatchObject({ type: "completed" });
    await fixture.parentRun("again");
    expect(second).toMatchObject({ agentId: first!.agentId, created: false });
    expect(second!.runId).not.toBe(first!.runId);
    await expect(fixture.runtime.run(second!.runId).wait()).resolves.toMatchObject({ type: "completed" });
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen.at(-1)).toContain("first task");
    expect(seen.at(-1)).toContain("second task");
  } finally {
    await fixture.runtime.close();
  }
});

test("continuing a child that waits for input resumes the same Run with the input as the answer", async () => {
  let first: Delegated | undefined;
  let second: Delegated | undefined;
  const ask = phase("ask", async (_context, execution) => {
    const request = execution.interaction.request({ id: "q1", kind: "user_input", prompt: "Which branch?" });
    if (!execution.interaction.answers().has(request.id)) execution.interaction.suspend();
    return { message: "got it", route: "stop", payload: execution.interaction.answers().get(request.id) as never };
  });
  const fixture = await setup({
    childPhases: [ask],
    script: async (execution, input) => {
      if (input === "go") {
        first = await execution.agents.delegate({ create: () => fixture.childConfiguration("child-v1"), input: "start" });
      } else if (input === "reply") {
        second = await execution.agents.delegate({ agentId: first!.agentId, create: () => fixture.childConfiguration("x"), input: "main" });
      }
      return null;
    },
  });
  try {
    await fixture.parentRun("go");
    await expect(fixture.runtime.run(first!.runId).wait()).resolves.toMatchObject({ type: "input_required" });
    await fixture.parentRun("reply");
    expect(second).toEqual({ agentId: first!.agentId, runId: first!.runId, created: false });
    await expect(fixture.runtime.run(first!.runId).wait()).resolves.toMatchObject({ type: "completed" });
  } finally {
    await fixture.runtime.close();
  }
});

test("continuing a child that is running queues a new Run behind it", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const order: string[] = [];
  const work = phase("work", async (context) => {
    order.push(String(context.execution.input));
    if (context.execution.input === "slow") await gate;
    return { message: `done ${String(context.execution.input)}`, route: "stop" };
  });
  let first: Delegated | undefined;
  let second: Delegated | undefined;
  const fixture = await setup({
    childPhases: [work],
    script: async (execution, input) => {
      if (input === "go") {
        first = await execution.agents.delegate({ create: () => fixture.childConfiguration("child-v1"), input: "slow" });
      } else if (input === "more") {
        second = await execution.agents.delegate({ agentId: first!.agentId, create: () => fixture.childConfiguration("x"), input: "fast" });
      }
      return null;
    },
  });
  try {
    await fixture.parentRun("go");
    await eventually(async () => (await fixture.runtime.run(first!.runId).snapshot()).state === "running" ? true : undefined);
    await fixture.parentRun("more");
    expect(second!.agentId).toBe(first!.agentId);
    expect(second!.runId).not.toBe(first!.runId);
    await expect(fixture.runtime.run(second!.runId).snapshot()).resolves.toMatchObject({ state: "queued" });
    release();
    await expect(fixture.runtime.run(second!.runId).wait()).resolves.toMatchObject({ type: "completed" });
    expect(order).toEqual(["slow", "fast"]);
  } finally {
    await fixture.runtime.close();
  }
});

test("an agentId that is not a child of the current Agent is refused", async () => {
  let refusal: unknown;
  let stranger: AgentId | undefined;
  const fixture = await setup({
    script: async (execution) => {
      try {
        await execution.agents.delegate({ agentId: stranger!, create: () => fixture.childConfiguration("x"), input: "hijack" });
      } catch (error) {
        refusal = error;
      }
      return null;
    },
  });
  try {
    stranger = await fixture.runtime.createAgent(fixture.childConfiguration("stranger-v1"), { idempotencyKey: "stranger" });
    await fixture.parentRun("go");
    expect(refusal).toMatchObject({ name: "RuntimeError", code: "not_child_agent" });
    await expect(fixture.runtime.listRuns({ agentId: stranger })).resolves.toMatchObject({ items: [] });
  } finally {
    await fixture.runtime.close();
  }
});

test("the parent receives exactly one outcome input per settled child Run", async () => {
  let child: Delegated | undefined;
  const work = phase("work", async () => ({ message: "all green", route: "stop", payload: { files: 3 } }));
  const fixture = await setup({
    childPhases: [work],
    script: async (execution, input) => {
      if (input === "go") child = await execution.agents.delegate({ create: () => fixture.childConfiguration("child-v1"), input: "build" });
      return null;
    },
  });
  try {
    await fixture.parentRun("go");
    const reports = await eventually(async () => {
      const found = reportsOf(await userMessages(fixture.runtime, fixture.parentId), "rowan.child-outcome");
      return found.length > 0 ? found : undefined;
    });
    await settle();
    const all = reportsOf(await userMessages(fixture.runtime, fixture.parentId), "rowan.child-outcome");
    expect(all).toHaveLength(1);
    expect(reports[0]!.metadata).toEqual({
      kind: "rowan.child-outcome",
      childAgentId: child!.agentId,
      childRunId: child!.runId,
      state: "completed",
    });
    expect(reports[0]!.content).toMatchObject({
      kind: "rowan.child-outcome",
      childAgentId: child!.agentId,
      childRunId: child!.runId,
      state: "completed",
      message: "all green",
      payload: { files: 3 },
    });
  } finally {
    await fixture.runtime.close();
  }
});

test("a failed child Run reports its failure and a cancelled one its reason", async () => {
  let failing: Delegated | undefined;
  const boom = phase("boom", async (context, execution) => {
    if (context.execution.input === "hold") await new Promise((resolve) => execution.interaction.signal.addEventListener("abort", resolve));
    else throw new Error("kaput");
    return { message: "stopped", route: "stop" };
  });
  const fixture = await setup({
    childPhases: [boom],
    script: async (execution, input) => {
      if (input === "go") failing = await execution.agents.delegate({ create: () => fixture.childConfiguration("child-v1"), input: "x" });
      return null;
    },
  });
  try {
    await fixture.parentRun("go");
    const [failure] = await eventually(async () => {
      const found = reportsOf(await userMessages(fixture.runtime, fixture.parentId), "rowan.child-outcome");
      return found.length > 0 ? found : undefined;
    });
    expect(failure!.metadata).toMatchObject({ childAgentId: failing!.agentId, state: "failed" });
    expect(failure!.content.error).toContain("kaput");

    const queued = await fixture.runtime.start(failing!.agentId, "hold", { idempotencyKey: "cancel-me" });
    await eventually(async () => (await queued.snapshot()).state === "running" ? true : undefined);
    await queued.cancel("not needed");
    const found = await eventually(async () => {
      const reports = reportsOf(await userMessages(fixture.runtime, fixture.parentId), "rowan.child-outcome");
      return reports.find(({ metadata }) => metadata.state === "cancelled");
    });
    expect(found.content).toMatchObject({ state: "cancelled", reason: "not needed", childRunId: queued.id });
  } finally {
    await fixture.runtime.close();
  }
});

test("the outcome is delivered once even when the consumer replays the whole log after a restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rowan-child-agents-"));
  const filename = join(directory, "runtime.sqlite");
  try {
    const work = phase("work", async () => ({ message: "finished", route: "stop" }));
    let child: Delegated | undefined;
    const first = await setup({
      store: new SqliteStore(filename),
      childPhases: [work],
      script: async (execution, input) => {
        if (input === "go") child = await execution.agents.delegate({ create: () => first.childConfiguration("child-v1"), input: "build" });
        return null;
      },
    });
    const parentId = first.parentId;
    await first.parentRun("go");
    await eventually(async () => {
      const found = reportsOf(await userMessages(first.runtime, parentId), "rowan.child-outcome");
      return found.length > 0 ? found : undefined;
    });
    await first.runtime.close();

    // Forget how far the consumer got: everything is delivered a second time.
    const database = new Database(filename);
    database.run("DELETE FROM consumer_checkpoints WHERE consumer_id = 'rowan:child-reports'");
    database.close();

    const store = new SqliteStore(filename);
    const runtime = await AgentRuntime.init({ store, concurrency: 4 });
    try {
      await settle(400);
      const reports = reportsOf(await userMessages(runtime, parentId), "rowan.child-outcome");
      expect(reports).toHaveLength(1);
      expect(reports[0]!.metadata.childRunId).toBe(child!.runId);
      const page = await runtime.listAgents();
      expect(page.items.find(({ id }) => id === child!.agentId)?.parentAgentId).toBe(parentId);
    } finally {
      await runtime.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function permissionExtension() {
  return loadExtensionFromFactory((api) => {
    api.tools.register({
      name: "file_writer",
      description: "Write a file",
      parameters: { type: "object", properties: { path: { type: "string" } } },
      execute: async () => ({ content: [{ type: "text", text: "written" }] }),
    });
    api.hooks.on("before_tool_call", (event) => {
      if (event.tool.name !== "file_writer") return { allow: true };
      if (event.answer !== undefined) {
        return event.answer === "allow" ? { allow: true } : { allow: false, reason: "denied" };
      }
      const args = event.args as Record<string, any>;
      return { interaction: { kind: "permission", prompt: `Allow writing to ${args.path}?`, payload: { path: args.path } } };
    });
  }, process.cwd(), "<runtime-extension>");
}

/** A child model that writes a file, then finishes. */
function writingChild(): StreamFn {
  let turn = 0;
  return async function* () {
    turn += 1;
    if (turn === 1) {
      const id = "call_write";
      const args = JSON.stringify({ path: "secrets.txt" });
      const partial = { role: "assistant" as const, contentBlocks: [{ type: "tool_call" as const, id, name: "file_writer", args }] };
      yield { type: "tool_call_start", id, name: "file_writer", partial };
      yield { type: "tool_call_delta", id, arguments: args, partial };
      yield { type: "tool_call_end", id, name: "file_writer", arguments: args, partial };
      yield { type: "done" };
      return;
    }
    yield { type: "done", response: stopResponse("written") };
  };
}

test("the parent receives the child's permission Interaction with the requested tool call", async () => {
  let child: Delegated | undefined;
  const fixture = await setup({
    childStream: writingChild(),
    extensions: [permissionExtension()],
    script: async (execution, input) => {
      if (input === "go") child = await execution.agents.delegate({ create: () => fixture.childConfiguration("child-v1"), input: "write it" });
      return null;
    },
  });
  try {
    await fixture.parentRun("go");
    const [report] = await eventually(async () => {
      const found = reportsOf(await userMessages(fixture.runtime, fixture.parentId), "rowan.child-interaction");
      return found.length > 0 ? found : undefined;
    });
    await settle();
    expect(reportsOf(await userMessages(fixture.runtime, fixture.parentId), "rowan.child-interaction")).toHaveLength(1);
    const boundary = await fixture.runtime.run(child!.runId).wait();
    if (boundary.type !== "input_required") throw new Error("Expected the child to wait.");
    const interaction = boundary.interactions[0]!;
    expect(report!.metadata).toEqual({
      kind: "rowan.child-interaction",
      childAgentId: child!.agentId,
      childRunId: child!.runId,
      interactionId: interaction.id,
      interactionKind: "permission",
    });
    expect(report!.content).toMatchObject({
      childAgentId: child!.agentId,
      interactionId: interaction.id,
      interactionKind: "permission",
      prompt: "Allow writing to secrets.txt?",
      payload: { path: "secrets.txt" },
      toolCall: { name: "file_writer", args: { path: "secrets.txt" } },
    });
  } finally {
    await fixture.runtime.close();
  }
});

test("owner loss during a held child Tool Call reports the failure to its parent", async () => {
  const fixture = await setup({});
  let recovered: AgentRuntime | undefined;
  try {
    const owned = (fixture.runtime as unknown as { owned: OwnedStore }).owned;
    const child = await owned.reserveAgent({ idempotencyKey: "held-child", parentAgentId: fixture.parentId });
    await owned.activateAgent(child.id);
    const childRun = await owned.createRun({ agentId: child.id, input: "write it", idempotencyKey: "held-child-run" });
    const claimed = await owned.claimRun({ runId: childRun.id, expectedRevision: childRun.revision });
    const reserved = await owned.reserveToolCall({
      runId: childRun.id,
      execution: claimed.execution,
      expectedRevision: claimed.run.revision,
      requestMessageId: "held-child-request" as never,
      toolCallId: "held-child-tool" as never,
      name: "file_writer",
      args: { path: "secrets.txt" },
    });
    const started = await owned.startToolCall({
      runId: childRun.id,
      execution: claimed.execution,
      expectedRevision: reserved.run.revision,
      toolCallId: reserved.toolCall.id,
    });
    await owned.raiseInteraction({
      runId: childRun.id,
      execution: claimed.execution,
      expectedRevision: started.run.revision,
      interaction: {
        id: "held-child-approval",
        phase: "work",
        kind: "permission",
        prompt: "Allow writing to secrets.txt?",
        toolCallId: reserved.toolCall.id,
        createdAt: new Date().toISOString(),
        status: "pending",
      },
    });
    expect(await owned.snapshotRun(childRun.id)).toMatchObject({
      state: "input_required",
      interactions: [{ id: "held-child-approval" }],
    });

    await fixture.runtime.close();
    recovered = await fixture.restart();
    const failure = {
      code: "tool_indeterminate",
      message: "The Runtime owner was sealed.",
      toolCallIds: [reserved.toolCall.id],
    } as const;
    await expect(recovered.run(childRun.id).wait()).resolves.toEqual({ type: "failed", failure });
    expect(await recovered.snapshot(childRun.id)).toMatchObject({ state: "failed", failure });

    const report = await eventually(async () => {
      const reports = reportsOf(await userMessages(recovered!, fixture.parentId), "rowan.child-outcome");
      return reports.find(({ metadata }) => metadata.childRunId === childRun.id);
    });
    expect(report.metadata).toMatchObject({
      childAgentId: child.id,
      childRunId: childRun.id,
      state: "failed",
    });
    expect(report.content).toMatchObject({ code: "tool_indeterminate", error: failure.message });
    expect((await recovered.history(child.id)).find((message) =>
      message.role === "interaction" && message.interactionId === "held-child-approval"
    )).toMatchObject({ status: "cancelled" });
    expect((fixture.store as InMemoryStore).exportState().toolCalls.filter((toolCall) =>
      toolCall.runId === childRun.id
      && (toolCall.status === "pending" || toolCall.status === "in_progress"
        || toolCall.state === "pending" || toolCall.state === "in_progress")
    )).toEqual([]);
  } finally {
    await recovered?.close();
    await fixture.runtime.close().catch(() => undefined);
  }
});

test("a child's parentAgentId persists in both durable stores", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rowan-child-agents-store-"));
  try {
    for (const store of [new InMemoryStore(), new SqliteStore(join(directory, "runtime.sqlite"))]) {
      const first = await store.openOwner({ ownerId: "owner-1", leaseMs: 10_000 });
      const parent = await first.reserveAgent({ idempotencyKey: "parent" });
      const child = await first.reserveAgent({ idempotencyKey: "child", parentAgentId: parent.id });
      expect(child.parentAgentId).toBe(parent.id);
      await first.activateAgent(child.id);
      await first.sealAndReleaseOwner();

      const second = await store.openOwner({ ownerId: "owner-2", leaseMs: 10_000 });
      const agents = await second.listAgents();
      expect(agents.find(({ id }) => id === child.id)?.parentAgentId).toBe(parent.id);
      expect(agents.find(({ id }) => id === parent.id)?.parentAgentId).toBeUndefined();
      // Replaying the reservation returns the same linked Agent.
      await expect(second.reserveAgent({ idempotencyKey: "child", parentAgentId: parent.id })).resolves.toMatchObject({ id: child.id, parentAgentId: parent.id });
      await second.sealAndReleaseOwner();
      if (store instanceof SqliteStore) store.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a live Interaction raised while the child's tool runs reaches the parent, and its answer resolves the tool", async () => {
  let child: Delegated | undefined;
  let toolOutcome: unknown;
  const childStream: StreamFn = async function* (_request, ctx) {
    toolOutcome = await (ctx as any).tools.call("file_writer", { path: "secrets.txt" });
    yield { type: "done", response: stopResponse("written") };
  };
  const fixture = await setup({
    childStream,
    childPhases: [{ name: "work", description: "work", filePath: "<test>", baseDir: "<test>", content: "work", isolated: false }],
    extensions: [permissionExtension()],
    script: async (execution, input) => {
      if (input === "go") child = await execution.agents.delegate({ create: () => fixture.childConfiguration("child-v1"), input: "write it" });
      return null;
    },
  });
  try {
    await fixture.parentRun("go");
    const [report] = await eventually(async () => {
      const found = reportsOf(await userMessages(fixture.runtime, fixture.parentId), "rowan.child-interaction");
      return found.length > 0 ? found : undefined;
    });
    expect(report!.metadata).toEqual({
      kind: "rowan.child-interaction",
      childAgentId: child!.agentId,
      childRunId: child!.runId,
      interactionId: report!.content.interactionId,
      interactionKind: "permission",
    });
    expect(report!.content).toMatchObject({ prompt: "Allow writing to secrets.txt?", payload: { path: "secrets.txt" } });
    await expect(fixture.runtime.snapshot(child!.runId)).resolves.toMatchObject({ state: "input_required", interactions: [{ id: report!.content.interactionId, phase: "work" }] });
    await fixture.runtime.respondInteraction(child!.runId, { interactionId: report!.content.interactionId, input: "allow" });
    await expect(fixture.runtime.run(child!.runId).wait()).resolves.toMatchObject({ type: "completed" });
    expect(toolOutcome).toMatchObject({ ok: true });
  } finally {
    await fixture.runtime.close();
  }
});

test("a second held child Interaction reaches the parent, and each durable report is delivered exactly once", async () => {
  let child: Delegated | undefined;
  const answers: unknown[] = [];
  const childStream: StreamFn = async function* (_request, rawCtx) {
    const ctx = rawCtx as any;
    answers.push(...await Promise.all([
      ctx.interact({ id: "first", kind: "permission", prompt: "Allow first?", payload: { target: "one" } }),
      ctx.interact({ id: "second", kind: "permission", prompt: "Allow second?", payload: { target: "two" } }),
    ]));
    yield { type: "done", response: stopResponse("child done") };
  };
  const fixture = await setup({
    childStream,
    childPhases: [{ name: "work", description: "work", filePath: "<test>", baseDir: "<test>", content: "work", isolated: false }],
    script: async (execution, input) => {
      if (input === "go") child = await execution.agents.delegate({ create: () => fixture.childConfiguration("child-v1"), input: "ask twice" });
      return null;
    },
  });
  try {
    await fixture.parentRun("go");
    const reports = await eventually(async () => {
      const found = reportsOf(await userMessages(fixture.runtime, fixture.parentId), "rowan.child-interaction");
      return found.length >= 2 ? found : undefined;
    });
    await settle();
    const settledReports = reportsOf(await userMessages(fixture.runtime, fixture.parentId), "rowan.child-interaction");
    expect(settledReports).toHaveLength(2);
    expect(new Set(settledReports.map((report) => report.metadata.interactionId)).size).toBe(2);
    expect(settledReports.map((report) => report.content.prompt).sort()).toEqual(["Allow first?", "Allow second?"]);
    expect(reports.map((report) => report.content.interactionId).sort()).toEqual(
      settledReports.map((report) => report.metadata.interactionId).sort(),
    );

    const boundary = await fixture.runtime.run(child!.runId).wait();
    if (boundary.type !== "input_required") throw new Error("Expected two held child Interactions.");
    expect(boundary.interactions).toHaveLength(2);
    for (const interaction of boundary.interactions) {
      await fixture.runtime.respondInteraction(child!.runId, { interactionId: interaction.id, input: "allow" });
    }
    await expect(fixture.runtime.run(child!.runId).wait()).resolves.toMatchObject({ type: "completed" });
    expect(answers).toEqual(["allow", "allow"]);
  } finally {
    await fixture.runtime.close();
  }
});

test("delegate({ agentId }) replies to a held child wait with the not-granted reply text", async () => {
  let child: Delegated | undefined;
  let childError: unknown;
  const childStream: StreamFn = async function* (_request, rawCtx) {
    try {
      await (rawCtx as any).interact({ id: "approval", kind: "permission", prompt: "Allow?" });
    } catch (error) {
      childError = error;
    }
    yield { type: "done", response: stopResponse("child continued") };
  };
  const fixture = await setup({
    childStream,
    childPhases: [{ name: "work", description: "work", filePath: "<test>", baseDir: "<test>", content: "work", isolated: false }],
    script: async (execution, input) => {
      if (input === "go") {
        child = await execution.agents.delegate({ create: () => fixture.childConfiguration("child-v1"), input: "start" });
      } else if (input === "reply") {
        await execution.agents.delegate({ agentId: child!.agentId, create: () => { throw new Error("unused"); }, input: "changed course" });
      }
      return null;
    },
  });
  try {
    await fixture.parentRun("go");
    await expect(fixture.runtime.run(child!.runId).wait()).resolves.toMatchObject({ type: "input_required" });
    await fixture.parentRun("reply");
    await eventually(() => childError);
    expect(childError).toBeInstanceOf(RunInteractionCancelledError);
    expect((childError as Error).message).toBe("The user replied instead: changed course");
    await expect(fixture.runtime.run(child!.runId).wait()).resolves.toMatchObject({ type: "completed" });
  } finally {
    await fixture.runtime.close();
  }
});
