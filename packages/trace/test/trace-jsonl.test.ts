import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "bun:test";
import { Agent } from "@rowan-agent/agent/agent";
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
  const messageStart = events.find((event) => event.type === "message_start");
  const messageDeltas = events.filter((event) => event.type === "message_delta");
  const messageEnd = events.find((event) => event.type === "message_end");

  expect(trace).toContain("\"type\":\"session_created\"");
  expect(sessionCreated.session.messages).toBeUndefined();
  expect(sessionCreated.session.messageCount).toBeUndefined();
  expect(sessionCreated.session.logLength).toBeUndefined();
  expect(sessionCreated.session.createdAt).toBeUndefined();
  expect(sessionCreated.session.updatedAt).toBeUndefined();
  expect(trace).toContain("\"userInput\":\"use echo tool\"");
  expect(trace).toContain("\"type\":\"session_start\"");
  expect(messageStart.content).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ role: "system", content: "Test system" }),
      expect.objectContaining({ role: "user", content: "use echo tool" }),
    ]),
  );
  expect(messageDeltas.length).toBeGreaterThan(0);
  expect(messageDeltas[0].delta).toEqual(
    expect.objectContaining({ role: "assistant", content: expect.any(String) }),
  );
  expect(messageDeltas[0].content).toEqual([...messageStart.content, messageDeltas[0].delta]);
  expect(messageEnd.content.length).toBeGreaterThan(messageStart.content.length);
  expect(trace).toContain("\"type\":\"tool_call_end\"");
  expect(trace).toContain("\"type\":\"outcome\"");
});

test("jsonlTraceWriter records model calls and message deltas without structured output traces", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-trace-model-"));
  const tracePath = join(root, "run.jsonl");
  const responses = [
    {
      message: "A task is needed for echo.",
      needsTask: true,
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
      evidence: ["hello"],
      failedCriteria: [],
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
  const agent = new Agent({
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
  });

  const traceWriter = jsonlTraceWriter(tracePath);
  agent.subscribe(traceWriter);
  await agent.prompt("hello");
  await agent.flushTrace();

  const trace = await readFile(tracePath, "utf8");
  const events = trace
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const planCall = events.find((event) => event.type === "model_call" && event.phase === "plan");
  const planPromptDelta = events.find(
    (event) =>
      event.type === "message_delta" &&
      !Array.isArray(event.delta) &&
      event.delta.metadata?.kind === "model_prompt" &&
      event.delta.metadata.phase === "plan",
  );
  const planMessageDelta = events.find(
    (event) =>
      event.type === "message_delta" &&
      !Array.isArray(event.delta) &&
      event.delta.metadata?.kind === "model_message" &&
      event.delta.metadata.phase === "plan",
  );
  const planPromptIndex = events.findIndex((event) => event === planPromptDelta);
  const planCallIndex = events.findIndex((event) => event.type === "model_call" && event.phase === "plan");
  const taskCreatedIndex = events.findIndex(
    (event, index) => index > planCallIndex && event.type === "task_created",
  );
  const deltasAfterPlanCall = events
    .slice(planCallIndex + 1, taskCreatedIndex)
    .filter((event) => event.type === "message_delta");
  const deltasBeforePlanCall = events
    .slice(0, planCallIndex)
    .filter((event) => event.type === "message_delta");

  expect(trace).toContain("\"type\":\"session_created\"");
  expect(trace).toContain("\"userInput\":\"hello\"");
  expect(trace).toContain("\"type\":\"model_call\"");
  expect(trace).toContain("\"phase\":\"plan\"");
  expect(trace).not.toContain("\"type\":\"model_request\"");
  expect(trace).not.toContain("\"type\":\"model_response\"");
  expect(deltasAfterPlanCall).toHaveLength(1);
  expect(deltasBeforePlanCall).toEqual(expect.arrayContaining([planPromptDelta]));
  expect(planPromptIndex).toBeLessThan(planCallIndex);
  expect(planMessageDelta).toBe(deltasAfterPlanCall[0]);
  expect(planPromptDelta.delta).toEqual(
    expect.objectContaining({
      role: "user",
      content: expect.stringContaining("JSON-only contract"),
      metadata: expect.objectContaining({
        kind: "model_prompt",
        phase: "plan",
        source: "context",
      }),
    }),
  );
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
  const planSessionMessage = agent.state.session?.messages.find(
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
  expect(planPromptDelta.content.at(-1)).toEqual(planPromptDelta.delta);
  expect(planMessageDelta.content.at(-2)).toEqual(planPromptDelta.delta);
  expect(planMessageDelta.content.at(-1)).toEqual(planMessageDelta.delta);
  expect(JSON.stringify(planMessageDelta.delta)).not.toContain("\"request\"");
  expect(JSON.stringify(planMessageDelta.delta)).not.toContain("\"rawResponse\"");
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
  expect(trace).toContain("\"type\":\"tool_call_requested\"");
});

test("jsonlTraceWriter snapshots event payloads before async writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-trace-snapshot-"));
  const tracePath = join(root, "run.jsonl");
  const writer = jsonlTraceWriter(tracePath);
  const event: Extract<AgentEvent, { type: "tool_call_start" }> = {
    type: "tool_call_start",
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
