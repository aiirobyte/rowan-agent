import { expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Type from "typebox";
import type { StreamFn } from "@rowan-agent/models";
import { AgentRuntime, InMemoryStore } from "../../src/runtime";
import type { AgentId } from "../../src/runtime-events";
import { createAgentWith } from "../fixtures/configuration";
import { stopResponse } from "./route-test-utils";

async function waitForLines(filePath: string, minLines: number, timeoutMs = 2000): Promise<string[]> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (existsSync(filePath)) {
      const lines = readFileSync(filePath, "utf8").trim().split("\n").filter(Boolean);
      if (lines.length >= minLines) {
        return lines;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const actual = existsSync(filePath) ? readFileSync(filePath, "utf8").trim().split("\n").filter(Boolean) : [];
  throw new Error(`Timed out waiting for ${minLines} lines in ${filePath}. Actual lines (${actual.length}):\n${actual.join("\n")}`);
}

test("AgentRuntime writes pi-format session file and passes sessionId to model", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "rowan-session-files-"));
  const tempCwd = await mkdtemp(join(tmpdir(), "rowan-cwd-"));

  const tool = {
    name: "lookup",
    description: "Look up a test value.",
    parameters: Type.Object({ query: Type.String() }),
    async execute() {
      return { ok: true as const, content: "result text" };
    },
  };

  const requests: any[] = [];
  let modelCalls = 0;
  const stream: StreamFn = async function* (request) {
    requests.push(request);
    modelCalls += 1;
    if (modelCalls === 1) {
      const id = "call_lookup";
      const args = JSON.stringify({ query: "pi" });
      const partial = { role: "assistant" as const, contentBlocks: [{ type: "tool_call" as const, id, name: tool.name, args }] };
      yield { type: "tool_call_start", id, name: tool.name, partial };
      yield { type: "tool_call_delta", id, arguments: args, partial };
      yield { type: "tool_call_end", id, name: tool.name, arguments: args, partial };
      yield {
        type: "done",
        response: {
          content: "",
          toolCalls: [{ id, name: tool.name, arguments: { query: "pi" } }],
          stopReason: "tool_use",
          usage: {
            inputTokens: 10,
            outputTokens: 5,
            cacheReadTokens: 2,
            cacheWriteTokens: 1,
            totalTokens: 18,
          },
        },
      };
      return;
    }

    const text = "lookup complete";
    yield { type: "text_delta", text, partial: { role: "assistant", contentBlocks: [{ type: "text", text }] } };
    yield {
      type: "done",
      response: {
        ...stopResponse(text),
        usage: {
          inputTokens: 20,
          outputTokens: 15,
          cacheReadTokens: 4,
          cacheWriteTokens: 2,
          totalTokens: 41,
        },
      },
    };
  };

  const store = new InMemoryStore();
  const runtime = await AgentRuntime.init({
    store,
    concurrency: 1,
    sessionFiles: { dir: tempDir },
  });

  try {
    const agentId = await createAgentWith(runtime, { identity: "test-pi-session", stream, tools: [tool] });
    const run = await runtime.start(agentId, "hello", { cwd: tempCwd, idempotencyKey: "run-1" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });

    // Assert that the stub stream received sessionId === agentId
    expect(requests.length).toBe(2);
    expect(requests[0].sessionId).toBe(agentId);
    expect(requests[1].sessionId).toBe(agentId);

    const agent = (await runtime.listAgents()).items.find((a) => a.id === agentId)!;
    expect(agent).toBeDefined();
    const agentCreatedAt = agent.createdAt;

    // Assert file path and name shape
    const safeCwd = tempCwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-");
    const expectedDir = join(tempDir, `--${safeCwd}--`);
    const fileTimestamp = agentCreatedAt.replace(/[:.]/g, "-");
    const expectedFile = join(expectedDir, `${fileTimestamp}_${agentId}.jsonl`);

    const lines = await waitForLines(expectedFile, 6);
    expect(lines.length).toBe(6);

    // Header line
    const header = JSON.parse(lines[0]);
    expect(header).toEqual({
      type: "session",
      version: 3,
      id: agentId,
      timestamp: agentCreatedAt,
      cwd: tempCwd,
    });

    // User message entry
    const userEntry = JSON.parse(lines[1]);
    expect(userEntry).toMatchObject({
      type: "message",
      id: expect.any(String),
      parentId: null,
      timestamp: expect.any(String),
      message: {
        role: "user",
        content: "hello",
        timestamp: expect.any(Number),
      },
    });

    // Model change entry preceding the first assistant entry
    const modelChangeEntry = JSON.parse(lines[2]);
    const modelChangeId = modelChangeEntry.id;
    expect(modelChangeEntry).toMatchObject({
      type: "model_change",
      parentId: userEntry.id,
      timestamp: expect.any(String),
      provider: "test",
      modelId: "model",
    });

    // Assistant toolCall entry
    const assistantEntry = JSON.parse(lines[3]);
    const assistantId = assistantEntry.id;
    expect(assistantEntry).toMatchObject({
      type: "message",
      id: expect.any(String),
      parentId: modelChangeEntry.id,
      timestamp: expect.any(String),
      message: {
        role: "assistant",
        provider: "test",
        model: "model",
        usage: {
          input: 10,
          output: 5,
          cacheRead: 2,
          cacheWrite: 1,
          totalTokens: 18,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        content: [{
          type: "toolCall",
          id: "call_lookup",
          name: "lookup",
          arguments: { query: "pi" },
        }],
        stopReason: "toolUse",
        timestamp: expect.any(Number),
      },
    });
    expect(modelChangeId).toBe(`${assistantId}:model`);

    // Tool result entry
    const toolEntry = JSON.parse(lines[4]);
    expect(toolEntry.id).toMatch(/:0$/);
    expect(toolEntry).toMatchObject({
      type: "message",
      parentId: assistantEntry.id,
      timestamp: expect.any(String),
      message: {
        role: "toolResult",
        toolCallId: "call_lookup",
        toolName: "lookup",
        content: [{ type: "text", text: "result text" }],
        isError: false,
        timestamp: expect.any(Number),
      },
    });

    // Assistant final answer entry (no model_change precedes it since model is unchanged)
    const finalEntry = JSON.parse(lines[5]);
    expect(finalEntry).toMatchObject({
      type: "message",
      id: expect.any(String),
      parentId: toolEntry.id,
      timestamp: expect.any(String),
      message: {
        role: "assistant",
        provider: "test",
        model: "model",
        usage: {
          input: 20,
          output: 15,
          cacheRead: 4,
          cacheWrite: 2,
          totalTokens: 41,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        content: [{ type: "text", text: "lookup complete" }],
        stopReason: "stop",
        timestamp: expect.any(Number),
      },
    });

    // Durable-level assertion that runtime.history assistant messages carry model and usage
    const history = await runtime.history(agentId);
    const assistantMessages = history.filter((m): m is import("../../src/runtime-events").AssistantMessage => m.role === "assistant");
    expect(assistantMessages).toHaveLength(2);
    expect(assistantMessages[0].model).toEqual({ provider: "test", id: "model" });
    expect(assistantMessages[0].usage).toMatchObject({ inputTokens: 10, outputTokens: 5, totalTokens: 18 });
    expect(assistantMessages[1].model).toEqual({ provider: "test", id: "model" });
    expect(assistantMessages[1].usage).toMatchObject({ inputTokens: 20, outputTokens: 15, totalTokens: 41 });
  } finally {
    await runtime.close();
    await rm(tempDir, { recursive: true, force: true });
    await rm(tempCwd, { recursive: true, force: true });
  }
});

test("AgentRuntime writes nothing when sessionFiles is absent", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "rowan-session-files-empty-"));
  const stream: StreamFn = async function* () {
    yield { type: "text_delta", text: "done", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "done" }] } };
    yield { type: "done", response: stopResponse("done") };
  };

  const store = new InMemoryStore();
  const runtime = await AgentRuntime.init({ store, concurrency: 1 });
  try {
    const agentId = await createAgentWith(runtime, { identity: "test-no-session-files", stream });
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "run-no-files" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(readdirSync(tempDir)).toHaveLength(0);
  } finally {
    await runtime.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("AgentRuntime uses --unknown-- folder and header cwd empty string when run has no cwd", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "rowan-session-files-unknown-"));
  const stream: StreamFn = async function* () {
    yield { type: "text_delta", text: "done", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "done" }] } };
    yield { type: "done", response: stopResponse("done") };
  };

  const store = new InMemoryStore();
  const runtime = await AgentRuntime.init({
    store,
    concurrency: 1,
    sessionFiles: { dir: tempDir },
  });

  try {
    const agentId = await createAgentWith(runtime, { identity: "test-unknown-cwd", stream });
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "run-unknown" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });

    const agent = (await runtime.listAgents()).items.find((a) => a.id === agentId)!;
    const expectedDir = join(tempDir, "--unknown--");
    const fileTimestamp = agent.createdAt.replace(/[:.]/g, "-");
    const expectedFile = join(expectedDir, `${fileTimestamp}_${agentId}.jsonl`);

    const lines = await waitForLines(expectedFile, 3);
    const header = JSON.parse(lines[0]);
    expect(header).toEqual({
      type: "session",
      version: 3,
      id: agentId,
      timestamp: agent.createdAt,
      cwd: "",
    });
  } finally {
    await runtime.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("at-least-once safety skips existing entries on restart and handles message revision as branch", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "rowan-session-files-restart-"));
  const tempCwd = await mkdtemp(join(tmpdir(), "rowan-cwd-"));

  const stream: StreamFn = async function* () {
    yield { type: "text_delta", text: "done", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "done" }] } };
    yield { type: "done", response: stopResponse("done") };
  };

  const store = new InMemoryStore();
  let runtime = await AgentRuntime.init({
    store,
    concurrency: 1,
    sessionFiles: { dir: tempDir },
  });

  let agentId: AgentId;
  let expectedFile: string;

  try {
    agentId = await createAgentWith(runtime, { identity: "test-restart", stream });
    const run = await runtime.start(agentId, "original message", { cwd: tempCwd, idempotencyKey: "run-restart-1" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });

    const agent = (await runtime.listAgents()).items.find((a) => a.id === agentId)!;
    const safeCwd = tempCwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-");
    const expectedDir = join(tempDir, `--${safeCwd}--`);
    const fileTimestamp = agent.createdAt.replace(/[:.]/g, "-");
    expectedFile = join(expectedDir, `${fileTimestamp}_${agentId}.jsonl`);

    const lines = await waitForLines(expectedFile, 4);
    expect(lines.length).toBe(4);
  } finally {
    await runtime.close();
  }

  // Restart runtime with the same store and directory
  runtime = await AgentRuntime.init({
    store,
    concurrency: 1,
    sessionFiles: { dir: tempDir },
  });

  try {
    // Redelivery / restart should not duplicate lines
    await new Promise((resolve) => setTimeout(resolve, 80));
    let lines = readFileSync(expectedFile, "utf8").trim().split("\n").filter(Boolean);
    expect(lines.length).toBe(4);

    // Now revise the original user message
    const history = await runtime.history(agentId);
    const userMessage = history.find((m) => m.role === "user")!;
    expect(userMessage).toBeDefined();

    await runtime.revise(agentId, {
      messageId: userMessage.id,
      expectedMessageRevision: 0,
      content: "revised message",
      operationId: "op-1",
    });

    lines = await waitForLines(expectedFile, 5);
    expect(lines.length).toBe(5);
    const revisedEntry = JSON.parse(lines[4]);
    const originalEntry = JSON.parse(lines[1]);
    expect(revisedEntry.id).toBe(`${userEntryId(originalEntry.id)}@1`);
    expect(revisedEntry.parentId).toBe(originalEntry.parentId); // branches from original parent
    expect(revisedEntry.message.content).toBe("revised message");
  } finally {
    await runtime.close();
    await rm(tempDir, { recursive: true, force: true });
    await rm(tempCwd, { recursive: true, force: true });
  }

  function userEntryId(id: string): string {
    return id;
  }
});
