import { expect, test } from "bun:test";
import { Agent, messageContentText, type StreamFn } from "../src";
import type { LlmRequest } from "../src/types";
import { createId } from "../src/utils";
import { createTestContext, runAgentTurn } from "./support/agent-run";
import { createEchoTools } from "./support/echo-tool";
import { buildTestPartial, buildToolCallPartial, scriptedStream, yieldRouteToolCall } from "./support/scripted-stream";

function detectPhase(messages: LlmRequest["messages"]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const content = messages[i].content;
    if (typeof content === "string") {
      const match = content.match(/^Phase:\s*(\w+)/);
      if (match) return match[1];
    }
  }
  return "chat";
}

test("Agent.run reuses one session for multi-turn direct responses", async () => {
  const routeContexts: string[][] = [];
  const stream: StreamFn = async function* directMultiTurnStream(request) {
    const phase = detectPhase(request.messages);
    if (phase !== "chat") {
      return;
    }

    routeContexts.push(request.messages.map((message) => messageContentText(message.content)));
    const sawFirstAnswer = request.messages.some((message) => messageContentText(message.content).includes("First answer"));
    const message = sawFirstAnswer ? "Second answer saw the first turn." : "First answer";
    yield { type: "model_requested", model: request.model, usage: { inputMessages: request.messages.length } };
    const text = message;
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield* yieldRouteToolCall("stop", message, text);
    yield { type: "done" };
  };
  const agent = new Agent({
    context: createTestContext(),
    model: { provider: "test", id: "direct-multiturn" },
    stream,
  });
  const events: string[] = [];
  agent.subscribe((event) => {
    events.push(event.type);
  });

  const first = await runAgentTurn(agent, "first");
  const sessionId = agent.state.sessionId;
  const second = await runAgentTurn(agent, "second");

  expect(first.outcome.message).toBe("First answer");
  expect(second.outcome.message).toBe("Second answer saw the first turn.");
  expect(agent.state.sessionId).toBe(sessionId);
  expect(agent.state.context.messages.filter((message) => message.role === "user")).toHaveLength(2);
  expect(agent.state.context.messages.some((message) => messageContentText(message.content).includes("First answer"))).toBe(true);
  expect(routeContexts[1]).toEqual(
    expect.arrayContaining(["first", expect.stringContaining("First answer"), "second"]),
  );
  expect(events).toEqual(expect.arrayContaining(["turn_start"]));
});

test("Agent keeps conversation messages separate from execution steps", async () => {
  const contexts: string[][] = [];
  const events: string[] = [];
  const stream: StreamFn = async function* taskMultiTurnStream(request, options) {
    contexts.push(request.messages.map((message) => message.content as string));
    // Simple response without phase routing
    const userMessages = request.messages.filter(m => m.role === "user" && typeof m.content === "string" && !m.content.startsWith("Phase:"));
    const lastUser = userMessages.length > 0 ? userMessages[userMessages.length - 1] : undefined;
    const currentRequest = lastUser && typeof lastUser.content === "string" ? lastUser.content : "";
    const text = `Response to: ${currentRequest}`;
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield { type: "done" };
  };
  const agent = new Agent({
    context: createTestContext({ tools: createEchoTools() }),
    model: { provider: "test", id: "scripted" },
    stream,
  });
  agent.subscribe((event) => {
    events.push(event.type);
  });

  const first = await runAgentTurn(agent, "use echo tool");
  const sessionId = agent.state.sessionId;
  const second = await runAgentTurn(agent, "use echo tool again");

  expect(agent.state.sessionId).toBe(sessionId);
  expect(contexts[1]).toEqual(
    expect.arrayContaining([
      "use echo tool",
      expect.stringContaining("Response to: use echo tool"),
      "use echo tool again",
    ]),
  );
  expect(
    agent.state.context.messages.some(
      (message) =>
        message.role === "assistant" && messageContentText(message.content).includes("Response to: use echo tool"),
    ),
  ).toBe(true);
});

test("Agent does not carry failed task outcomes into later turns", async () => {
  const contexts: string[][] = [];
  let callCount = 0;
  const stream: StreamFn = async function* failedThenDirectStream(request) {
    callCount++;
    contexts.push(request.messages.map((message) => message.content as string));

    // Check if there's a failed outcome in context
    const hasFailedOutcome = request.messages.some(
      (message) => message.role === "assistant" && typeof message.content === "string" && message.content.includes("Task failed")
    );

    // First call returns failure, second call returns success regardless
    const text = callCount === 1 ? "Task failed: missing requirements" : "Recovered direct answer.";
    yield { type: "model_requested", model: request.model, usage: { inputMessages: request.messages.length } };
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield { type: "done" };
  };
  const agent = new Agent({
    context: createTestContext(),
    model: { provider: "test", id: "failed-then-direct" },
    stream,
    maxAttempts: 1,
  });

  const first = await runAgentTurn(agent, "trigger failure");
  const second = await runAgentTurn(agent, "hello");

  expect(first.outcome.message).toBe("Task failed: missing requirements");
  expect(second.outcome.message).toBe("Recovered direct answer.");
});
