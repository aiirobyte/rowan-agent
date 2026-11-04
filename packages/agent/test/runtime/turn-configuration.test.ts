import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Type from "typebox";
import type { LlmRequest, StreamFn } from "@rowan-agent/models";
import {
  AgentRuntime,
  InMemoryConfigProvider,
  InMemoryStore,
  SqliteStore,
  type AgentConfiguration,
} from "../../src/runtime/index";
import type { AgentDefinition } from "../../src/harness/definitions";
import type { Phase } from "../../src/harness/phases/types";
import type { AgentId, Message } from "../../src/runtime-events";
import { loadExtensionFromFactory } from "../../src/extensions/loader";
import { configuration, testDefinition, TEST_SOURCE } from "../fixtures/configuration";
import { stopResponse } from "./route-test-utils";

const NOTICE_START = "<configuration_update>";

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => part && typeof part === "object" && "text" in part ? String(part.text) : "").join("\n");
}

async function waitForSessionUser(filePath: string, text: string, timeoutMs = 2000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (existsSync(filePath)) {
      try {
        const entries = readFileSync(filePath, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
        const entry = entries.find((candidate) =>
          candidate.type === "message"
          && candidate.message?.role === "user"
          && textOf(candidate.message.content).includes(text));
        if (entry) return entry;
      } catch {
        // The file is being appended.
      }
    }
    await Bun.sleep(20);
  }
  throw new Error(`Timed out waiting for user message "${text}" in ${filePath}.`);
}

function messageTexts(request: LlmRequest, role?: "user" | "assistant" | "tool"): string[] {
  return request.messages
    .filter((message) => role === undefined || message.role === role)
    .map((message) => textOf(message.content));
}

function toolNames(request: LlmRequest): string[] {
  return (request.tools ?? []).map(({ name }) => name);
}

function noticeOf(message: Message | undefined): string | undefined {
  return message?.configuration?.notice;
}

function tool(name: string, execute?: (args: any) => Promise<any>) {
  return {
    name,
    description: `${name} tool`,
    parameters: Type.Object({}),
    execute: execute ?? (async () => ({ ok: true as const, content: name })),
  };
}

function skill(name: string, description: string) {
  return {
    name,
    description,
    filePath: `/tmp/${name}/SKILL.md`,
    baseDir: `/tmp/${name}`,
    content: description,
  };
}

function phase(name: string, content: string, overrides: Partial<Phase> = {}): Phase {
  return {
    name,
    description: content,
    content,
    filePath: "",
    baseDir: "",
    ...overrides,
  };
}

function modelStream(id: string, handler: (request: LlmRequest) => AsyncGenerator<any>) {
  return async function* (request: LlmRequest) {
    if (request.model.id !== id) throw new Error(`Stream ${id} received ${request.model.id}`);
    yield* handler(request);
  } satisfies StreamFn;
}

function finalStream(text: string) {
  return async function* (_request?: LlmRequest) {
    yield { type: "text_delta" as const, text, partial: { role: "assistant" as const, contentBlocks: [{ type: "text" as const, text }] } };
    yield { type: "done" as const, response: stopResponse(text) };
  };
}

function turnBoundaryStream(text: string) {
  return async function* (_request?: LlmRequest) {
    yield { type: "text_delta" as const, text, partial: { role: "assistant" as const, contentBlocks: [{ type: "text" as const, text }] } };
    yield { type: "done" as const, response: { content: text, stopReason: "stop" as const } };
  };
}

function toolCallResponse(id: string, name: string) {
  return {
    content: "",
    toolCalls: [{ id, name, arguments: {} }],
    stopReason: "tool_use" as const,
  };
}

const ALL_SOURCES = {
  agents: [TEST_SOURCE],
  tools: [TEST_SOURCE, "rowan.extensions"],
  skills: [TEST_SOURCE, "rowan.extensions"],
  phases: [TEST_SOURCE, "rowan.extensions"],
} as const;

class LossySnapshotConfigProvider extends InMemoryConfigProvider {
  private readonly lossy = new Set<string>();

  markLossy(token: string): void {
    this.lossy.add(token);
  }

  override async resolve(input: Parameters<InMemoryConfigProvider["resolve"]>[0]) {
    const resolution = await super.resolve(input);
    if (resolution.kind === "available" && this.lossy.has(input.token)) {
      return { kind: "available" as const, config: JSON.parse(JSON.stringify(resolution.config)) };
    }
    return resolution;
  }
}

async function createAgent(
  runtime: AgentRuntime,
  input: Readonly<{
    identity: string;
    stream: StreamFn;
    model?: AgentConfiguration["model"];
    definition?: Partial<AgentDefinition>;
    tools?: ReturnType<typeof tool>[];
    skills?: ReturnType<typeof skill>[];
    phases?: Phase[];
  }>,
) {
  const definition = testDefinition(input.definition);
  await seedAgentResources(runtime, { ...input, definition });
  const config = configuration({
    identity: input.identity,
    definition: definition.name,
    view: ALL_SOURCES,
    model: input.model ?? { provider: "test", id: "model-a" },
    stream: input.stream,
  });
  const agentId = await runtime.createAgent(config, { idempotencyKey: `${input.identity}-agent` });
  return { agentId, config, definition };
}

async function seedAgentResources(
  runtime: AgentRuntime,
  input: Readonly<{
    definition: AgentDefinition;
    tools?: ReturnType<typeof tool>[];
    skills?: ReturnType<typeof skill>[];
    phases?: Phase[];
  }>,
) {
  const { definition } = input;
  await runtime.loadAgents({ sourceId: TEST_SOURCE, values: [definition] });
  if (input.tools) await runtime.loadTools({ sourceId: TEST_SOURCE, values: input.tools });
  if (input.skills) await runtime.loadSkills({ sourceId: TEST_SOURCE, values: input.skills });
  if (input.phases) await runtime.loadPhases({ sourceId: TEST_SOURCE, values: input.phases });
}

test("a configuration change made while a Turn streams leaves that Turn alone", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const requestsA: LlmRequest[] = [];
  const requestsB: LlmRequest[] = [];
  let round = 0;
  const streamA = modelStream("model-a", async function* (request) {
    requestsA.push(request);
    round += 1;
    if (round === 1) {
      const id = "call-probe";
      const args = "{}";
      const partial = { role: "assistant" as const, contentBlocks: [{ type: "tool_call" as const, id, name: "probe", args }] };
      yield { type: "tool_call_start", id, name: "probe", partial };
      yield { type: "tool_call_delta", id, arguments: args, partial };
      yield { type: "tool_call_end", id, name: "probe", arguments: args, partial };
      await gate;
      yield { type: "done", response: toolCallResponse(id, "probe") };
      return;
    }
    yield* finalStream("finished")({ model: { provider: "test", id: "model-a" } } as LlmRequest);
  });
  const streamB = modelStream("model-b", async function* (request) {
    requestsB.push(request);
    yield* finalStream("finished")({ model: { provider: "test", id: "model-b" } } as LlmRequest);
  });
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const { agentId, config } = await createAgent(runtime, {
      identity: "turn-in-flight",
      stream: streamA,
      tools: [tool("probe")],
    });
    const first = await runtime.start(agentId, "first", { idempotencyKey: "first-run" });
    for (let index = 0; index < 400 && requestsA.length === 0; index += 1) await Bun.sleep(5);
    if (requestsA.length === 0) throw new Error(JSON.stringify(await first.snapshot()));

    await runtime.updateAgentConfig(agentId, configuration({
      identity: "turn-in-flight",
      definition: config.definition.name,
      view: ALL_SOURCES,
      model: { provider: "test", id: "model-b" },
      stream: streamB,
    }), { idempotencyKey: "switch-to-b" });
    await runtime.loadTools({ sourceId: TEST_SOURCE, values: [tool("probe"), tool("added")] });
    release();

    await expect(first.wait()).resolves.toMatchObject({ type: "completed" });

    expect(requestsA).toHaveLength(2);
    expect(requestsA[1]?.model.id).toBe("model-a");
    expect(toolNames(requestsA[1]!)).not.toContain("added");
    expect(requestsB).toHaveLength(0);

    const second = await runtime.start(agentId, "second", { idempotencyKey: "second-run" });
    await expect(second.wait()).resolves.toMatchObject({ type: "completed" });
    expect(requestsB).toHaveLength(1);
    expect(requestsB[0]?.model.id).toBe("model-b");
    expect(toolNames(requestsB[0]!)).toContain("added");
    const secondUser = requestsB[0]?.messages.find((message) => message.role === "user" && textOf(message.content).includes("second"));
    expect(textOf(secondUser?.content)).toStartWith(NOTICE_START);
    expect(textOf(secondUser?.content)).toContain("Tools added: added");
  } finally {
    await runtime.close();
  }
});

test("a lossy stored prefix snapshot does not fail a new Turn", async () => {
  const configs = new LossySnapshotConfigProvider();
  const requests: LlmRequest[] = [];
  const stream: StreamFn = async function* (request) {
    requests.push(request);
    yield* finalStream("done")(request);
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), configs, concurrency: 1 });
  try {
    const { agentId } = await createAgent(runtime, {
      identity: "lossy-prefix",
      stream,
      tools: [tool("base")],
    });
    await expect((await runtime.start(agentId, "first", { idempotencyKey: "lossy-r1" })).wait())
      .resolves.toMatchObject({ type: "completed" });
    const firstUser = (await runtime.history(agentId)).find((message) =>
      message.role === "user" && message.content === "first");
    const token = firstUser?.configuration?.token;
    if (!token) throw new Error("Expected a prefix Config Token.");
    configs.markLossy(token);

    await runtime.loadTools({ sourceId: TEST_SOURCE, values: [tool("base"), tool("added")] });
    await expect((await runtime.start(agentId, "second", { idempotencyKey: "lossy-r2" })).wait())
      .resolves.toMatchObject({ type: "completed" });

    expect(requests).toHaveLength(2);
    expect(toolNames(requests[1]!)).toContain("added");
    const secondUser = (await runtime.history(agentId)).find((message) =>
      message.role === "user" && message.content === "second");
    expect(secondUser?.configuration?.prefix).toBe(true);
    expect(noticeOf(secondUser)).toBeUndefined();
  } finally {
    await runtime.close();
  }
});

test("a resource change keeps the prefix bytes and removed Tools wait for compaction", async () => {
  const sessionDir = await mkdtemp(join(tmpdir(), "rowan-turn-session-"));
  const requests: LlmRequest[] = [];
  let round = 0;
  const stream: StreamFn = async function* (request) {
    requests.push(request);
    round += 1;
    if (round === 1) {
      yield* finalStream("one")(request);
      return;
    }
    if (round === 2) {
      const id = "call-x";
      const args = "{}";
      const partial = { role: "assistant" as const, contentBlocks: [{ type: "tool_call" as const, id, name: "x", args }] };
      yield { type: "tool_call_start", id, name: "x", partial };
      yield { type: "tool_call_delta", id, arguments: args, partial };
      yield { type: "tool_call_end", id, name: "x", arguments: args, partial };
      yield { type: "done", response: toolCallResponse(id, "x") };
      return;
    }
    yield* finalStream("three")(request);
  };
  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
    sessionFiles: { dir: sessionDir },
  });
  try {
    const { agentId } = await createAgent(runtime, {
      identity: "prefix-bytes",
      stream,
      tools: [tool("x")],
    });
    const first = await runtime.start(agentId, "first", { idempotencyKey: "r1" });
    await expect(first.wait()).resolves.toMatchObject({ type: "completed" });
    const r1 = requests[0]!;

    await runtime.loadTools({ sourceId: TEST_SOURCE, values: [] });
    await runtime.loadSkills({ sourceId: TEST_SOURCE, values: [skill("s", "Skill S is available.")] });
    const second = await runtime.start(agentId, "second", { idempotencyKey: "r2" });
    await expect(second.wait()).resolves.toMatchObject({ type: "completed" });
    const r2 = requests[1]!;

    expect(r2.system).toBe(r1.system);
    const withoutPhasePrompt = (messages: LlmRequest["messages"]) =>
      messages.filter((message) => !textOf(message.content).startsWith("<phase_content"));
    const r1Durable = withoutPhasePrompt(r1.messages);
    const r2Durable = withoutPhasePrompt(r2.messages);
    expect(r2Durable.slice(0, r1Durable.length)).toEqual(r1Durable);
    expect(r2Durable[r1Durable.length]).toEqual({ role: "assistant", content: "one" });
    const turnTwoUser = r2.messages.find((message) => message.role === "user" && textOf(message.content).includes("second"));
    expect(textOf(turnTwoUser?.content)).toStartWith(NOTICE_START);
    expect(textOf(turnTwoUser?.content)).toContain("Tools removed: x");
    expect(textOf(turnTwoUser?.content)).toContain("Skills added: s");
    expect(toolNames(r2)).toEqual(toolNames(r1));
    const removedResult = (await runtime.history(agentId)).find((message) => message.role === "tool");
    expect(removedResult?.role).toBe("tool");
    if (removedResult?.role === "tool") {
      expect(removedResult.content[0]?.result).toMatchObject({ error: 'Tool "x" was removed.' });
    }

    await expect((await runtime.compactContext(agentId)).wait()).resolves.toMatchObject({ type: "completed" });
    const third = await runtime.start(agentId, "third", { idempotencyKey: "r3" });
    await expect(third.wait()).resolves.toMatchObject({ type: "completed" });
    const r3 = requests.at(-1)!;
    expect(r3.system).toContain("Skill S is available.");
    expect(toolNames(r3)).not.toContain("x");
    expect(r3.messages.some((message) => textOf(message.content).includes(NOTICE_START))).toBe(false);

    const agent = (await runtime.listAgents()).items.find((candidate) => candidate.id === agentId)!;
    const fileTimestamp = agent.createdAt.replace(/[:.]/g, "-");
    const sessionFile = join(sessionDir, "--unknown--", `${fileTimestamp}_${agentId}.jsonl`);
    const sessionUser = await waitForSessionUser(sessionFile, "second");
    expect(sessionUser.message.content[0]?.type).toBe("text");
    expect(sessionUser.message.content[0]?.text).toStartWith(NOTICE_START);
  } finally {
    await runtime.close();
    await rm(sessionDir, { recursive: true, force: true });
  }
});

test("nothing is added when nothing changed", async () => {
  const requests: LlmRequest[] = [];
  const stream: StreamFn = async function* (request) {
    requests.push(request);
    yield* finalStream("done")(request);
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const { agentId, config } = await createAgent(runtime, { identity: "no-change", stream });
    await expect((await runtime.start(agentId, "one", { idempotencyKey: "one" })).wait()).resolves.toMatchObject({ type: "completed" });
    await expect((await runtime.start(agentId, "two", { idempotencyKey: "two" })).wait()).resolves.toMatchObject({ type: "completed" });

    expect(requests[1]?.system).toBe(requests[0]?.system);
    expect(requests.every((request) => request.messages.every((message) => !textOf(message.content).includes(NOTICE_START)))).toBe(true);
    const history = await runtime.history(agentId);
    const firstUser = history.find((message) => message.role === "user");
    expect(firstUser?.configuration).toMatchObject({ prefix: true });
    expect(noticeOf(firstUser)).toBeUndefined();

    await runtime.updateAgentConfig(agentId, configuration({
      identity: config.identity,
      definition: config.definition.name,
      view: config.resourceView,
      model: config.model,
      stream,
    }), { idempotencyKey: "identical-update" });
    await expect((await runtime.start(agentId, "three", { idempotencyKey: "three" })).wait()).resolves.toMatchObject({ type: "completed" });
    expect(requests.at(-1)?.system).toBe(requests[0]?.system);
    expect(requests.at(-1)?.messages.every((message) => !textOf(message.content).includes(NOTICE_START))).toBe(true);
  } finally {
    await runtime.close();
  }
});

test("after restart a permission inside a Turn keeps its configuration", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rowan-turn-permission-"));
  const filename = join(directory, "runtime.sqlite");
  const configs = new InMemoryConfigProvider();
  const requestsA: LlmRequest[] = [];
  const requestsB: LlmRequest[] = [];
  const createExtension = () => loadExtensionFromFactory((api) => {
    api.hooks.on("before_tool_call", (event) => {
      if (event.answer !== undefined) {
        return event.answer === "allow" ? { allow: true } : { allow: false, reason: "denied" };
      }
      return { interaction: { kind: "permission", prompt: "Allow?" } };
    });
  }, process.cwd(), "<runtime-extension>");
  const streamA = modelStream("model-a", async function* (request) {
    requestsA.push(request);
    if (requestsA.length === 1) {
      const id = "call-guard";
      const args = "{}";
      const partial = { role: "assistant" as const, contentBlocks: [{ type: "tool_call" as const, id, name: "guard", args }] };
      yield { type: "tool_call_start", id, name: "guard", partial };
      yield { type: "tool_call_delta", id, arguments: args, partial };
      yield { type: "tool_call_end", id, name: "guard", arguments: args, partial };
      yield { type: "done", response: toolCallResponse(id, "guard") };
      return;
    }
    yield* finalStream("finished")(request);
  });
  const streamB = modelStream("model-b", async function* (request) {
    requestsB.push(request);
    yield* finalStream("finished")(request);
  });

  try {
    let runId!: string;
    let agentId!: AgentId;
    let definition!: AgentDefinition;
    const firstStore = new SqliteStore(filename);
    const firstRuntime = await AgentRuntime.init({
      store: firstStore,
      configs,
      concurrency: 1,
      bootstrap: async (registry) => { await registry.loadExtensions([createExtension()]); },
    });
    try {
      const created = await createAgent(firstRuntime, {
        identity: "permission-restart",
        stream: streamA,
        tools: [tool("guard")],
      });
      definition = created.definition;
      agentId = created.agentId;
      const run = await firstRuntime.start(agentId, "run", { idempotencyKey: "run-1" });
      runId = run.id;
      await expect(run.wait()).resolves.toMatchObject({ type: "input_required" });
      await firstRuntime.updateAgentConfig(agentId, configuration({
        identity: "permission-restart",
        definition: created.config.definition.name,
        view: ALL_SOURCES,
        model: { provider: "test", id: "model-b" },
        stream: streamB,
      }), { idempotencyKey: "switch-b" });
    } finally {
      await firstRuntime.close();
      firstStore.close();
    }

    const secondStore = new SqliteStore(filename);
    const secondRuntime = await AgentRuntime.init({
      store: secondStore,
      configs,
      concurrency: 1,
      bootstrap: async (registry) => { await registry.loadExtensions([createExtension()]); },
    });
    try {
      await seedAgentResources(secondRuntime, { definition, tools: [tool("guard")] });
      const resumed = secondRuntime.run(runId as never);
      const waiting = await resumed.snapshot();
      if (waiting.state !== "input_required") throw new Error("Expected input_required");
      await resumed.respondInteraction({ interactionId: waiting.interactions[0]!.id, input: "allow" });
      await expect(resumed.wait()).resolves.toMatchObject({ type: "completed" });
      expect(requestsA).toHaveLength(2);
      expect(requestsA[1]?.model.id).toBe("model-a");
      expect(requestsB).toHaveLength(0);

      const next = await secondRuntime.start(agentId, "next", { idempotencyKey: "run-2" });
      await expect(next.wait()).resolves.toMatchObject({ type: "completed" });
      expect(requestsB).toHaveLength(1);
      expect(requestsB[0]?.model.id).toBe("model-b");
    } finally {
      await secondRuntime.close();
      secondStore.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("after restart a turn boundary reply uses the new configuration", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rowan-turn-boundary-"));
  const filename = join(directory, "runtime.sqlite");
  const configs = new InMemoryConfigProvider();
  const requestsA: LlmRequest[] = [];
  const requestsB: LlmRequest[] = [];
  const streamA = modelStream("model-a", async function* (request) {
    requestsA.push(request);
    yield* turnBoundaryStream("Question?")(request);
  });
  const streamB = modelStream("model-b", async function* (request) {
    requestsB.push(request);
    yield* turnBoundaryStream("Answer.")(request);
  });

  try {
    let agentId!: AgentId;
    let firstRunId!: import("../../src/runtime-events").RunId;
    let definition!: AgentDefinition;
    const plan = phase("plan", "Plan phase");
    const firstStore = new SqliteStore(filename);
    const firstRuntime = await AgentRuntime.init({ store: firstStore, configs, concurrency: 1 });
    try {
      const created = await createAgent(firstRuntime, {
        identity: "boundary-restart",
        stream: streamA,
        definition: { phases: { entryPhaseId: "plan", phaseIds: ["plan"] } },
        phases: [plan],
      });
      definition = created.definition;
      agentId = created.agentId;
      const firstRun = await firstRuntime.start(agentId, "hello", { idempotencyKey: "run-1" });
      firstRunId = firstRun.id;
      const firstBoundary = await firstRun.wait();
      expect(firstBoundary).toMatchObject({ type: "input_required" });
      await firstRuntime.loadTools({ sourceId: TEST_SOURCE, values: [tool("added")] });
      await firstRuntime.updateAgentConfig(agentId, configuration({
        identity: "boundary-restart",
        definition: created.config.definition.name,
        view: ALL_SOURCES,
        model: { provider: "test", id: "model-b" },
        stream: streamB,
      }), { idempotencyKey: "switch-b" });
    } finally {
      await firstRuntime.close();
      firstStore.close();
    }

    const secondStore = new SqliteStore(filename);
    const secondRuntime = await AgentRuntime.init({ store: secondStore, configs, concurrency: 1 });
    try {
      await seedAgentResources(secondRuntime, { definition, phases: [plan], tools: [tool("added")] });
      const beforeReply = await secondRuntime.run(firstRunId as never).snapshot();
      expect(beforeReply).toMatchObject({ state: "input_required" });
      if (beforeReply.state === "input_required") {
        expect(beforeReply.interactions[0]).toMatchObject({ kind: "user_input", turnBoundary: true });
      }
      const reply = await secondRuntime.start(agentId, "reply", { idempotencyKey: "run-2" });
      expect(reply.id).toBe(firstRunId);
      await expect(reply.wait()).resolves.toMatchObject({ type: "input_required" });
      expect(requestsB).toHaveLength(1);
      expect(requestsB[0]?.model.id).toBe("model-b");
      const history = await secondRuntime.history(agentId);
      const firstUser = history.find((message) => message.role === "user" && message.content === "hello");
      expect(firstUser?.configuration?.prefix).toBe(true);
      const replyUser = history.find((message) => message.role === "user" && message.content === "reply");
      expect(noticeOf(replyUser)).toContain("Tools added");
    } finally {
      await secondRuntime.close();
      secondStore.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a model switch also swaps the stream", async () => {
  const seenA: LlmRequest[] = [];
  const seenB: LlmRequest[] = [];
  const streamA = modelStream("model-a", async function* (request) {
    seenA.push(request);
    yield* finalStream("a")(request);
  });
  const streamB = modelStream("model-b", async function* (request) {
    seenB.push(request);
    yield* finalStream("b")(request);
  });
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const { agentId, config } = await createAgent(runtime, { identity: "model-switch", stream: streamA });
    await expect((await runtime.start(agentId, "one", { idempotencyKey: "one" })).wait()).resolves.toMatchObject({ type: "completed" });
    await runtime.updateAgentConfig(agentId, configuration({
      identity: config.identity,
      definition: config.definition.name,
      view: config.resourceView,
      model: { provider: "test", id: "model-b" },
      stream: streamB,
    }), { idempotencyKey: "switch" });
    await expect((await runtime.start(agentId, "two", { idempotencyKey: "two" })).wait()).resolves.toMatchObject({ type: "completed" });
    expect(seenA).toHaveLength(1);
    expect(seenB).toHaveLength(1);
    expect(seenB[0]?.model.id).toBe("model-b");
  } finally {
    await runtime.close();
  }
});

test("a removed current Phase restarts the Turn at the entry Phase", async () => {
  const requests: LlmRequest[] = [];
  const stream: StreamFn = async function* (request) {
    requests.push(request);
    yield* turnBoundaryStream("waiting")(request);
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const { agentId } = await createAgent(runtime, {
      identity: "phase-removed",
      stream,
      definition: { phases: { entryPhaseId: "p", phaseIds: ["p"] } },
      phases: [phase("p", "P phase content")],
    });
    await expect((await runtime.start(agentId, "hello", { idempotencyKey: "run-1" })).wait())
      .resolves.toMatchObject({ type: "input_required" });

    await runtime.loadPhases({ sourceId: TEST_SOURCE, values: [phase("q", "Q phase content")] });
    const reply = await runtime.start(agentId, "reply", { idempotencyKey: "run-2" });
    await expect(reply.wait()).resolves.toMatchObject({ type: "input_required" });
    const latest = requests.at(-1)!;
    expect(messageTexts(latest).some((text) => text.includes("Execute the current user request"))).toBe(true);
    expect(messageTexts(latest).some((text) => text.includes("P phase content"))).toBe(false);
    const replyUser = (await runtime.history(agentId)).find((message) => message.role === "user" && message.content === "reply");
    expect(noticeOf(replyUser)).toContain("Phases removed: p");
  } finally {
    await runtime.close();
  }
});

test("a Run suspended in the Phase-less entry Loop starts a new entry Phase", async () => {
  const requests: LlmRequest[] = [];
  const stream: StreamFn = async function* (request) {
    requests.push(request);
    yield* turnBoundaryStream("waiting")(request);
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const { agentId, config, definition } = await createAgent(runtime, {
      identity: "entry-loop-gains-entry",
      stream,
      definition: { phases: { entryPhaseId: null, phaseIds: ["-default"] } },
      phases: [phase("p", "P phase content")],
    });
    const first = await runtime.start(agentId, "hello", { idempotencyKey: "entry-r1" });
    await expect(first.wait()).resolves.toMatchObject({ type: "input_required" });

    await runtime.loadAgents({
      sourceId: TEST_SOURCE,
      values: [{ ...definition, phases: { entryPhaseId: "p", phaseIds: ["-default"] } }],
    });
    await runtime.updateAgentConfig(agentId, configuration({
      identity: config.identity,
      definition: config.definition.name,
      view: config.resourceView,
      model: config.model,
      stream,
    }), { idempotencyKey: "entry-phase-update" });

    const reply = await runtime.start(agentId, "reply", { idempotencyKey: "entry-r2" });
    await expect(reply.wait()).resolves.toMatchObject({ type: "input_required" });
    expect(messageTexts(requests.at(-1)!).some((text) => text.includes("P phase content"))).toBe(true);
  } finally {
    await runtime.close();
  }
});

test("answering a turn-boundary interaction starts a new Turn with the notice", async () => {
  const requestsA: LlmRequest[] = [];
  const requestsB: LlmRequest[] = [];
  const streamA = modelStream("model-a", async function* (request) {
    requestsA.push(request);
    yield* turnBoundaryStream("Question?")(request);
  });
  const streamB = modelStream("model-b", async function* (request) {
    requestsB.push(request);
    yield* turnBoundaryStream("Done.")(request);
  });
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const { agentId, config } = await createAgent(runtime, {
      identity: "answer-turn",
      stream: streamA,
      definition: { phases: { entryPhaseId: "plan", phaseIds: ["plan"] } },
      phases: [phase("plan", "Plan phase")],
    });
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "run-1" });
    const boundary = await run.wait();
    if (boundary.type !== "input_required") throw new Error("Expected input_required");

    await runtime.loadTools({ sourceId: TEST_SOURCE, values: [tool("added")] });
    await runtime.updateAgentConfig(agentId, configuration({
      identity: config.identity,
      definition: config.definition.name,
      view: config.resourceView,
      model: { provider: "test", id: "model-b" },
      stream: streamB,
    }), { idempotencyKey: "switch" });
    await run.respondInteraction({ interactionId: boundary.interactions[0]!.id, input: "continue" });
    await expect(run.wait()).resolves.toMatchObject({ type: "input_required" });

    expect(requestsB).toHaveLength(1);
    const answered = requestsB[0]?.messages.find((message) =>
      message.role === "user" && textOf(message.content).includes("The user answered"));
    expect(textOf(answered?.content)).toStartWith(NOTICE_START);
    const record = (await runtime.history(agentId)).find((message) =>
      message.role === "interaction" && message.status === "answered");
    expect(noticeOf(record)).toContain("Tools added");
  } finally {
    await runtime.close();
  }
});
