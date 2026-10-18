import { expect, test } from "bun:test";
import type { LlmRequest, StreamFn } from "@rowan-agent/models";
import type { AgentMessage, Tool, ToolCall, ToolResult } from "../../src/types";
import { createMessage } from "../../src/types";
import type { PhaseContext } from "../../src/harness/phases/types";
import type { InternalModelLoopOptions, ModelInvokeOutput, PhaseExecution } from "../../src/loop/execution";
import { runInternalModelLoop } from "../../src/harness/phases/core-phases";
import { AgentRuntime, InMemoryStore } from "../../src/runtime/index";
import { createPhaseAgent } from "../fixtures/configuration";
import { stopResponse } from "../runtime/route-test-utils";

function createDummyTool(name: string): Tool {
  return {
    name,
    description: `Dummy tool ${name}`,
    parameters: {} as Tool["parameters"],
    execute: async (_, context) => ({
      toolCallId: context.toolCallId,
      toolName: name,
      ok: true,
      content: `${name} output`,
    }),
  } as Tool;
}

function createTestContext(options?: { tools?: Tool[]; messages?: AgentMessage[] }): PhaseContext {
  return {
    systemPrompt: "You are a test agent.",
    messages: options?.messages ?? [createMessage("user", "Hello")],
    tools: options?.tools ?? [],
    skills: [],
    state: { current: "test-phase", available: ["test-phase", "stop"], iterations: 0 },
    invocation: { mode: "serial", instanceId: "inst-1" },
    execution: { agentId: "agent-1", runId: "run-1", executionId: "exec-1" },
  };
}

function createMockExecution(handlers: {
  invokeModel: (context: PhaseContext, options?: { output?: "reply" | "internal" }) => Promise<ModelInvokeOutput>;
  executeTools?: (context: PhaseContext, toolCalls: readonly ToolCall[]) => Promise<readonly ToolResult[]>;
}) {
  const executeToolsCalls: Array<readonly ToolCall[]> = [];
  const execution = {
    executeTools: async (ctx: PhaseContext, toolCalls: readonly ToolCall[]) => {
      executeToolsCalls.push(toolCalls);
      if (handlers.executeTools) return handlers.executeTools(ctx, toolCalls);
      return toolCalls.map((c) => ({ toolCallId: c.id, toolName: c.name, ok: true, content: `result for ${c.name}` }));
    },
    invokeModel: handlers.invokeModel,
  } as unknown as PhaseExecution;
  const loop = (context: PhaseContext, options: InternalModelLoopOptions, phase = "memorize") =>
    runInternalModelLoop(context, execution, phase, options);
  return { loop, executeToolsCalls };
}

const reply = (text: string): ModelInvokeOutput => ({ text, contentBlocks: [{ type: "text", text }], toolCalls: [] });
const calls = (...toolCalls: ToolCall[]): ModelInvokeOutput => ({ text: "", contentBlocks: [], toolCalls });

test("works on a copy: context.messages is unchanged and only the prompt is appended", async () => {
  const initialMessages = [createMessage("user", "Initial request"), createMessage("assistant", "Initial response")];
  const context = createTestContext({ tools: [createDummyTool("read")], messages: initialMessages });
  const seen: AgentMessage[][] = [];
  let invokeCount = 0;
  const { loop } = createMockExecution({
    invokeModel: async (working, opts) => {
      expect(opts?.output).toBe("internal");
      seen.push([...working.messages]);
      invokeCount += 1;
      return invokeCount === 1 ? calls({ id: "call_1", name: "read", args: JSON.stringify({ path: "a.txt" }) }) : reply("Done.");
    },
  });

  const result = await loop(context, { prompt: "Record.", tools: ["read"] });

  expect(result.text).toBe("Done.");
  expect(context.messages).toEqual(initialMessages);
  expect(seen[0]!.slice(0, 2)).toEqual(initialMessages);
  expect(seen[0]![2]).toMatchObject({ role: "user", content: "Record.", metadata: { kind: "phase_input", phase: "memorize" } });
  expect(seen[1]!.slice(3).map((m) => [m.role, m.metadata?.kind])).toEqual([["assistant", "phase_tool"], ["tool", "phase_tool"]]);
});

test("keeps the Tool definitions, System Prompt, and skills of the conversation", async () => {
  const tools = [createDummyTool("read"), createDummyTool("write"), createDummyTool("route")];
  const context = createTestContext({ tools });
  let working: PhaseContext | undefined;
  const { loop } = createMockExecution({
    invokeModel: async (ctx) => {
      working = ctx;
      return reply("ok");
    },
  });

  await loop(context, { prompt: "Check.", tools: ["read"] });

  expect(working!.tools).toEqual(tools);
  expect(working!.systemPrompt).toBe(context.systemPrompt);
  expect(working!.skills).toEqual(context.skills);
});

test("refuses calls to Tools outside tools, and route, with error results", async () => {
  const context = createTestContext({ tools: [createDummyTool("read"), createDummyTool("write"), createDummyTool("route")] });
  let invokeCount = 0;
  let lastWorking: AgentMessage[] = [];
  const { loop, executeToolsCalls } = createMockExecution({
    invokeModel: async (ctx) => {
      invokeCount += 1;
      lastWorking = [...ctx.messages];
      return invokeCount === 1
        ? calls(
            { id: "c_read", name: "read", args: { path: "notes.md" } },
            { id: "c_write", name: "write", args: { path: "out.md", content: "x" } },
            { id: "c_route", name: "route", args: { decision: [{ phase: "stop" }] } },
          )
        : reply("Finished.");
    },
  });

  const result = await loop(context, { prompt: "Scan.", tools: ["read", "route"] }, "audit");

  expect(result.text).toBe("Finished.");
  expect(executeToolsCalls.map((batch) => batch.map((c) => c.name))).toEqual([["read"]]);
  const results = lastWorking
    .filter((m) => m.role === "tool")
    .map((m) => JSON.parse((m.content as Array<{ content: string }>)[0]!.content) as ToolResult);
  expect(results.map((r) => [r.toolName, r.ok])).toEqual([["read", true], ["write", false], ["route", false]]);
  expect(results[1]).toMatchObject({ error: "Tool write is not available in Phase audit" });
});

test("allows every Tool but route when tools is omitted, through executeTools with parsed arguments", async () => {
  const context = createTestContext({ tools: [createDummyTool("read"), createDummyTool("write")] });
  let invokeCount = 0;
  const { loop, executeToolsCalls } = createMockExecution({
    invokeModel: async () => {
      invokeCount += 1;
      return invokeCount === 1
        ? calls({ id: "c1", name: "write", args: '{"path":"a.md","content":"x"}' }, { id: "c2", name: "route", args: {} })
        : reply("ok");
    },
  });

  await loop(context, { prompt: "Go." });

  expect(executeToolsCalls).toHaveLength(1);
  expect(executeToolsCalls[0]!.map((c) => [c.name, c.args])).toEqual([["write", { path: "a.md", content: "x" }]]);
});

test("respects maxToolRounds", async () => {
  const context = createTestContext({ tools: [createDummyTool("read")] });
  let invokeCount = 0;
  const { loop, executeToolsCalls } = createMockExecution({
    invokeModel: async () => {
      invokeCount += 1;
      return { text: `Round ${invokeCount}`, contentBlocks: [], toolCalls: [{ id: `c_${invokeCount}`, name: "read", args: {} }] };
    },
  });

  const result = await loop(context, { prompt: "Keep reading", tools: ["read"], maxToolRounds: 3 });

  expect(executeToolsCalls).toHaveLength(3);
  expect(invokeCount).toBe(4);
  expect(result.text).toBe("Round 4");
});

test("compaction's request starts with the conversation's own System Prompt, Tools, and history", async () => {
  const requests: LlmRequest[] = [];
  const stream: StreamFn = async function* (input) {
    requests.push(structuredClone(input));
    const text = `reply ${requests.length}`;
    yield { type: "text_delta", text, partial: { role: "assistant", contentBlocks: [{ type: "text", text }] } };
    yield { type: "done", response: stopResponse(text) };
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await createPhaseAgent(runtime, {
      identity: "internal-loop-prefix-agent",
      stream,
      phases: { phases: new Map(), entryPhaseId: "default" },
      options: { idempotencyKey: "internal-loop-prefix-agent" },
    });
    await (await runtime.start(agentId, "First request", { idempotencyKey: "turn-1" })).wait();
    const history = await runtime.history(agentId);
    await (await runtime.start(agentId, "Second request", { idempotencyKey: "turn-2" })).wait();
    const conversation = requests.at(-1)!;
    await (await runtime.compactContext(agentId, { idempotencyKey: "compact" })).wait();
    const internal = requests.at(-1)!;

    expect(internal).not.toBe(conversation);
    expect(internal.system).toBe(conversation.system);
    expect(internal.tools).toEqual(conversation.tools);
    expect(history.length).toBeGreaterThan(0);
    expect(internal.messages.slice(0, history.length)).toEqual(conversation.messages.slice(0, history.length));
  } finally {
    await runtime.close();
  }
});
