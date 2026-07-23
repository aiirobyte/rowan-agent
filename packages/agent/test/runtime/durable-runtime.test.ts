import { expect, test } from "bun:test";
import { AgentRuntime, InMemoryStore, type AgentConfig } from "../../src/runtime";
import Type from "typebox";
import type { StreamFn } from "@rowan-agent/models";
import type { RunId } from "../../src/runtime-events";
import type { Phase } from "../../src/harness/phases/types";
import { loadExtensionFromFactory } from "../../src/extensions/loader";

function simpleConfig(stream: StreamFn): AgentConfig {
  return {
    identity: "runtime-test-v1",
    model: { provider: "test", id: "model" },
    stream,
    context: { systemPrompt: "Test", tools: [], skills: [] },
  } as unknown as AgentConfig;
}

test("AgentRuntime generates a unique idempotency key for ordinary Agent creation", async () => {
  const stream: StreamFn = async function* () { yield { type: "done" }; };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore() });
  try {
    const first = await runtime.createAgent(simpleConfig(stream));
    const second = await runtime.createAgent(simpleConfig(stream), { metadata: { source: "test" } });

    expect(second).not.toBe(first);
    const agents = (await runtime.listAgents()).items;
    expect(agents.map((agent) => agent.id).sort()).toEqual([first, second].sort());
    expect(agents.find((agent) => agent.id === second)).toMatchObject({ metadata: { source: "test" } });
  } finally {
    await runtime.close();
  }
});

test("AgentRuntime replays Agent creation when the caller supplies a stable idempotency key", async () => {
  const stream: StreamFn = async function* () { yield { type: "done" }; };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore() });
  try {
    const config = simpleConfig(stream);
    const first = await runtime.createAgent(config, { idempotencyKey: "create-request-1" });
    const replay = await runtime.createAgent(config, { idempotencyKey: "create-request-1" });

    expect(replay).toBe(first);
    expect((await runtime.listAgents()).items).toHaveLength(1);
  } finally {
    await runtime.close();
  }
});

test("AgentRuntime runs a queued Run through claim and completion", async () => {
  const stream: StreamFn = async function* () {
    const text = "done";
    yield { type: "start", partial: { role: "assistant", contentBlocks: [] } };
    yield { type: "text_delta", text, partial: { role: "assistant", contentBlocks: [{ type: "text", text }] } };
    yield { type: "done", response: { content: text, stopReason: "stop" } };
  };
  const store = new InMemoryStore();
  const runtime = await AgentRuntime.init({ store, concurrency: 1 });
  try {
    const agentId = await runtime.createAgent(simpleConfig(stream), { idempotencyKey: "agent-1" });
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "run-1" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    await expect(run.snapshot()).resolves.toMatchObject({ state: "completed", outcome: { message: expect.any(String) } });
  } finally {
    await runtime.close();
  }
});

test("AgentRuntime routes Tool execution through durable lifecycle", async () => {
  let modelCalls = 0;
  let toolContext: { runId: string; toolCallId: string } | undefined;
  const tool = {
    name: "lookup",
    description: "Look up a value.",
    parameters: Type.Object({ query: Type.String() }),
    async execute(_args: unknown, context: { runId: string; toolCallId: string }) {
      toolContext = context;
      return { ok: true as const, content: { value: 42 } };
    },
  };
  const stream: StreamFn = async function* (request) {
    modelCalls += 1;
    if (modelCalls === 1) {
      const id = "call_lookup";
      const args = JSON.stringify({ query: "rowan" });
      const partial = { role: "assistant" as const, contentBlocks: [{ type: "tool_call" as const, id, name: tool.name, args }] };
      yield { type: "tool_call_start", id, name: tool.name, partial };
      yield { type: "tool_call_delta", id, arguments: args, partial };
      yield { type: "tool_call_end", id, name: tool.name, arguments: args, partial };
      yield { type: "done" };
      return;
    }
    const hasResult = request.messages.some((message) => Array.isArray(message.content) && message.content.some((part) => part.type === "tool_result"));
    if (!hasResult) throw new Error("model did not receive the Tool result");
    const text = "lookup complete";
    yield { type: "text_delta", text, partial: { role: "assistant", contentBlocks: [{ type: "text", text }] } };
    yield { type: "done" };
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await runtime.createAgent({
      ...simpleConfig(stream),
      context: { systemPrompt: "Test", tools: [tool], skills: [] },
    } as unknown as AgentConfig, {
      idempotencyKey: "agent-tool-lifecycle",
    });
    const run = await runtime.start(agentId, "use lookup", { idempotencyKey: "run-tool-lifecycle" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(modelCalls).toBe(2);
    expect(toolContext?.runId).toBe(run.id);
    expect(toolContext?.toolCallId).toMatch(/^tool_/);
    const observed = [];
    for await (const event of run.observe()) observed.push(event);
    const toolEvents = observed.filter((event) => event.kind === "tool_state_changed");
    expect(toolEvents.map((event) => event.transition.to)).toEqual(["pending", "running", "completed"]);
    expect(await run.snapshot()).toMatchObject({ state: "completed", toolCallCount: 1 });
  } finally {
    await runtime.close();
  }
});

test("AgentRuntime assembles extension Tools and hooks into a Run", async () => {
  let beforeCalls = 0;
  let afterCalls = 0;
  let contextMessages = 0;
  const extension = loadExtensionFromFactory((api) => {
    api.registerTool({
      name: "extension_lookup",
      description: "Look up a value from an extension.",
      parameters: { type: "object", properties: { query: { type: "string" } } },
      execute: async () => ({ content: [{ type: "text", text: "42" }] }),
    });
    api.on("before_tool_call", () => {
      beforeCalls += 1;
      contextMessages = api.context.getMessages?.().length ?? 0;
      return { allow: true };
    });
    api.on("after_tool_call", (event) => {
      afterCalls += 1;
      return { result: { ...event.result, content: { wrapped: event.result.content } } };
    });
  }, process.cwd(), "<runtime-extension>");
  let modelCalls = 0;
  const stream: StreamFn = async function* (request) {
    modelCalls += 1;
    if (modelCalls === 1) {
      expect(request.tools?.some((tool) => tool.name === "extension_lookup")).toBe(true);
      const id = "call_extension_lookup";
      const args = JSON.stringify({ query: "rowan" });
      const partial = { role: "assistant" as const, contentBlocks: [{ type: "tool_call" as const, id, name: "extension_lookup", args }] };
      yield { type: "tool_call_start", id, name: "extension_lookup", partial };
      yield { type: "tool_call_delta", id, arguments: args, partial };
      yield { type: "tool_call_end", id, name: "extension_lookup", arguments: args, partial };
      yield { type: "done" };
      return;
    }
    const toolResult = request.messages.flatMap((message) => Array.isArray(message.content) ? message.content : [])
      .find((part) => part.type === "tool_result");
    expect(toolResult && "content" in toolResult ? toolResult.content : "").toContain("wrapped");
    yield { type: "text_delta", text: "extension complete", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "extension complete" }] } };
    yield { type: "done" };
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await runtime.createAgent({
      ...simpleConfig(stream),
      extensions: [extension],
    } as unknown as AgentConfig, { idempotencyKey: "agent-extension-assembly" });
    const run = await runtime.start(agentId, "use extension", { idempotencyKey: "run-extension-assembly" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(beforeCalls).toBe(1);
    expect(afterCalls).toBe(1);
    expect(contextMessages).toBeGreaterThan(0);
  } finally {
    await runtime.close();
  }
});

test("AgentRuntime handles are stateless and report missing Runs on first I/O", async () => {
  const runtime = await AgentRuntime.init({ store: new InMemoryStore() });
  try {
    const handle = runtime.run("missing-run" as RunId);
    expect(handle.id).toBe("missing-run" as RunId);
    await expect(handle.snapshot()).rejects.toMatchObject({ code: "run_not_found" });
  } finally {
    await runtime.close();
  }
});

test("AgentRuntime resumes an input-required Run from its durable checkpoint", async () => {
  const phases = new Map<string, Phase>([
    ["plan", {
      name: "plan",
      description: "Plan",
      filePath: "<test>",
      baseDir: "<test>",
      content: "Plan",
      isolated: false,
    }],
    ["finish", {
      name: "finish",
      description: "Finish",
      filePath: "<test>",
      baseDir: "<test>",
      content: "Finish",
      isolated: false,
    }],
  ]);
  const stream: StreamFn = async function* () {
    const text = "Which target?";
    yield { type: "start", partial: { role: "assistant", contentBlocks: [] } };
    yield { type: "text_delta", text, partial: { role: "assistant", contentBlocks: [{ type: "text", text }] } };
    yield { type: "done", response: { content: text, stopReason: "stop" } };
  };
  const store = new InMemoryStore();
  const runtime = await AgentRuntime.init({ store, concurrency: 1 });
  try {
    const agentId = await runtime.createAgent({
      ...simpleConfig(stream),
      identity: "runtime-input-v1",
      context: { systemPrompt: "Test", tools: [], skills: [], phases: { phases, entryPhaseId: "plan" } },
    } as unknown as AgentConfig, { idempotencyKey: "agent-input" });
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "run-input" });
    const first = await run.wait();
    expect(first.type).toBe("input_required");
    if (first.type !== "input_required") return;
    const before = await run.snapshot();
    await run.respond({ requestId: first.requestId, input: "production" });
    const second = await run.wait();
    expect(second.type).toBe("input_required");
    expect((await run.snapshot()).revision).toBeGreaterThan(before.revision);
  } finally {
    await runtime.close();
  }
});

test("AgentRuntime retries the same Event before advancing live delivery", async () => {
  const stream: StreamFn = async function* () {
    yield { type: "text_delta", text: "done", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "done" }] } };
    yield { type: "done", response: { content: "done", stopReason: "stop" } };
  };
  const controller = new AbortController();
  const runtime = await AgentRuntime.init({ store: new InMemoryStore() });
  try {
    const agentId = await runtime.createAgent(simpleConfig(stream), { idempotencyKey: "consumer-agent" });
    const attempts: string[] = [];
    let failFirst = true;
    const consumer = await runtime.consume({
      consumerId: "consumer-1",
      signal: controller.signal,
      onEvent: (event) => {
        attempts.push(String(event.id));
        if (failFirst) {
          failFirst = false;
          throw new Error("retry");
        }
      },
    });
    await consumer.caughtUp;
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "consumer-run" });
    await run.wait();
    await new Promise((resolve) => setTimeout(resolve, 80));
    consumer.stop();
    await consumer.done;
    expect(attempts.length).toBeGreaterThan(1);
    expect(attempts[0]).toBe(attempts[1]);
  } finally {
    controller.abort();
    await runtime.close();
  }
});
