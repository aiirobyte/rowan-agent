import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "bun:test";
import { Agent, runThread } from "@rowan-agent/agent/agent";
import { createOpenAICompatibleStream, type OpenAICompatibleFetch } from "@rowan-agent/adapters/openai-compatible";
import { jsonlTraceWriter } from "../src/jsonl-writer";
import type { AgentEvent } from "@rowan-agent/agent/types";
import { createEchoTools } from "../../agent/test/support/echo-tool";
import { scriptedStream } from "../../agent/test/support/scripted-stream";

test("jsonlTraceWriter writes agent events", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-trace-"));
  const tracePath = join(root, "run.jsonl");
  const agent = new Agent({
    systemPrompt: "Test system",
    model: { provider: "test", name: "scripted" },
    stream: scriptedStream,
    tools: createEchoTools(),
  });

  const traceWriter = jsonlTraceWriter(tracePath);
  agent.subscribe(traceWriter);
  await agent.prompt("use echo tool");
  await agent.flushTrace();

  const trace = await readFile(tracePath, "utf8");
  const events = trace
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const sessionCreated = events.find((event) => event.type === "session_created");
  const chatStart = events.find((event) => event.type === "chat_start");
  const messageDeltas = events.filter((event) => event.type === "message_delta");
  const chatEnd = events.find((event) => event.type === "chat_end");
  const chatEndIndex = events.findIndex((event) => event.type === "chat_end");
  const outcomeIndex = events.findIndex((event) => event.type === "outcome");

  expect(trace).toContain("\"type\":\"session_created\"");
  expect(sessionCreated.session.messages).toBeUndefined();
  expect(sessionCreated.session.messageCount).toBeUndefined();
  expect(sessionCreated.session.logLength).toBeUndefined();
  expect(sessionCreated.session.createdAt).toBeUndefined();
  expect(sessionCreated.session.updatedAt).toBeUndefined();
  expect(trace).toContain("\"input\":\"use echo tool\"");
  expect(trace).not.toContain("\"type\":\"session_start\"");
  expect(trace).not.toContain("\"type\":\"session_end\"");
  expect(chatStart.content).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ role: "system", content: "Test system" }),
      expect.objectContaining({ role: "user", content: "use echo tool" }),
    ]),
  );
  expect(messageDeltas.length).toBeGreaterThan(0);
  expect(messageDeltas[0].delta).toEqual(
    expect.objectContaining({ role: "assistant", content: expect.any(String) }),
  );
  expect(messageDeltas[0]).not.toHaveProperty("content");
  expect(
    messageDeltas.some(
      (event) =>
        !Array.isArray(event.delta) &&
        event.delta.metadata?.kind === "outcome",
    ),
  ).toBe(false);
  expect(
    chatEnd.content.some(
      (message: { metadata?: { kind?: string } }) => message.metadata?.kind === "outcome",
    ),
  ).toBe(false);
  expect(chatEnd.content.length).toBeGreaterThan(chatStart.content.length);
  expect(chatEndIndex).toBeLessThan(outcomeIndex);
  expect(trace).toContain("\"type\":\"tool_end\"");
  expect(trace).toContain("\"type\":\"outcome\"");
});

test("jsonlTraceWriter records model calls and prompt/model message deltas without structured output traces", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-trace-model-"));
  const tracePath = join(root, "run.jsonl");
  const responses = [
    {
      message: "A task is needed for echo.",
      route: "task",
    },
    {
      message: "Planning echo.",
      task: {
        title: "Echo hello",
        instruction: "Use echo for hello.",
        acceptanceCriteria: ["Echo returns hello."],
        toolNames: ["echo"],
      },
    },
    {
      message: "Calling echo.",
      toolCalls: [{ id: "call_1", name: "echo", args: { message: "hello" } }],
    },
    {
      passed: true,
      message: "Echo returned hello.",
    },
  ];
  let index = 0;
  const fetchMock: OpenAICompatibleFetch = async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(responses[index++]) } }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  const tools = createEchoTools();
  const traceWriter = jsonlTraceWriter(tracePath);
  const result = await runThread({
    parentSessionId: "ses_parent",
    prompt: "hello",
    systemPrompt: "Test system",
    model: { provider: "openai-compatible", name: "test-model" },
    stream: createOpenAICompatibleStream({
      baseUrl: "https://api.example/v1",
      apiKey: "test-key",
      model: "test-model",
      fetch: fetchMock,
      tools,
    }),
    tools,
    emit: traceWriter,
  });
  await traceWriter.flush?.();

  const trace = await readFile(tracePath, "utf8");
  const events = trace
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const planCall = events.find((event) => event.type === "model_requested" && event.phase === "plan");
  const planMessageDelta = events.find(
    (event) =>
      event.type === "message_delta" &&
      !Array.isArray(event.delta) &&
      event.delta.metadata?.kind === "model_message" &&
      event.delta.metadata.phase === "plan",
  );
  const planPromptDelta = events.find(
    (event) =>
      event.type === "message_delta" &&
      !Array.isArray(event.delta) &&
      event.delta.metadata?.kind === "phase_prompt" &&
      event.delta.metadata.phase === "plan",
  );
  const planPromptIndex = events.findIndex((event) => event === planPromptDelta);
  const planCallIndex = events.findIndex((event) => event.type === "model_requested" && event.phase === "plan");
  const taskCreatedIndex = events.findIndex(
    (event, index) => index > planCallIndex && event.type === "task_created",
  );
  const deltasAfterPlanCall = events
    .slice(planCallIndex + 1, taskCreatedIndex)
    .filter((event) => event.type === "message_delta");

  expect(trace).toContain("\"type\":\"session_created\"");
  expect(trace).toContain("\"input\":\"hello\"");
  expect(trace).toContain("\"type\":\"model_requested\"");
  expect(trace).toContain("\"phase\":\"plan\"");
  expect(trace).not.toContain("\"type\":\"model_request\"");
  expect(trace).not.toContain("\"type\":\"model_response\"");
  expect(planPromptDelta).toBeDefined();
  expect(planPromptIndex).toBeLessThan(planCallIndex);
  expect(planPromptDelta.delta).toEqual(
    expect.objectContaining({
      role: "user",
      content: expect.stringContaining("Phase: plan"),
      metadata: expect.objectContaining({
        kind: "phase_prompt",
        phase: "plan",
      }),
    }),
  );
  expect(deltasAfterPlanCall).toHaveLength(1);
  expect(planMessageDelta).toBe(deltasAfterPlanCall[0]);
  expect(planMessageDelta.delta).toEqual(
    expect.objectContaining({
      role: "assistant",
      content: expect.stringContaining("\"task\""),
      metadata: expect.objectContaining({
        kind: "model_message",
        phase: "plan",
      }),
    }),
  );
  expect(JSON.parse(planMessageDelta.delta.content)).toMatchObject({
    message: "Planning echo.",
    task: {
      title: "Echo hello",
      toolNames: ["echo"],
    },
  });
  const planSessionMessage = result.session.messages.find(
    (message) => message.metadata?.kind === "model_message" && message.metadata.phase === "plan",
  );
  expect(planSessionMessage?.content).toBe(planMessageDelta.delta.content);
  expect(JSON.parse(planSessionMessage?.content ?? "{}")).toMatchObject({
    message: "Planning echo.",
    task: {
      title: "Echo hello",
      toolNames: ["echo"],
    },
  });
  expect(planMessageDelta).not.toHaveProperty("content");
  expect(JSON.stringify(planMessageDelta.delta)).not.toContain("\"request\"");
  expect(JSON.stringify(planMessageDelta.delta)).not.toContain("\"rawResponse\"");
  expect(trace).not.toContain("\"kind\":\"model_prompt\"");
  expect(trace).toContain("\"kind\":\"phase_prompt\"");
  expect(trace).toContain("JSON-only contract");
  expect(trace).toContain("Available tools with name");
  expect(trace).not.toContain("\"kind\":\"model_io\"");
  expect(planCall).toMatchObject({
    usage: {
      inputMessages: expect.any(Number),
    },
    ts: expect.any(String),
  });
  expect(planCall.usage).not.toHaveProperty("inputCharacters");
  expect(planCall.usage).not.toHaveProperty("inputTokensEstimate");
  expect(planCall.usage).not.toHaveProperty("outputCharacters");
  expect(planCall.usage).not.toHaveProperty("outputTokensEstimate");
  expect(planCall).not.toHaveProperty("durationMs");
  expect(planCall).not.toHaveProperty("startedAt");
  expect(planCall).not.toHaveProperty("endedAt");
  expect(planCall).not.toHaveProperty("request");
  expect(planCall).not.toHaveProperty("response");
  expect(planCall).not.toHaveProperty("trace");
  expect(trace).not.toContain("Conversation messages:");
  expect(trace).not.toContain("\"rawContent\"");
  expect(trace).not.toContain("\"type\":\"structured_output\"");
  expect(trace).toContain("\"type\":\"tool_requested\"");
});

test("jsonlTraceWriter snapshots event payloads before async writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-trace-snapshot-"));
  const tracePath = join(root, "run.jsonl");
  const writer = jsonlTraceWriter(tracePath);
  const event: Extract<AgentEvent, { type: "tool_start" }> = {
    type: "tool_start",
    toolName: "demo",
    args: { status: "pending" },
    ts: "2026-05-01T000000-00+08:00",
  };

  writer(event);
  (event.args as { status: string }).status = "running";
  await writer.flush?.();

  const trace = await readFile(tracePath, "utf8");
  expect(trace).toContain("\"status\":\"pending\"");
  expect(trace).not.toContain("\"status\":\"running\"");
});
