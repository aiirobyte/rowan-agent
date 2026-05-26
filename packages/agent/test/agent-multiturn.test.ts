import { expect, test } from "bun:test";
import { Agent, type StreamFn } from "../src";
import { createDefaultCriteria } from "@rowan-agent/agent";
import type { EngineContext } from "../src/types";
import { createId } from "../src/types";
import { createTestContext, runAgentTurn } from "./support/agent-run";
import { createEchoTools } from "./support/echo-tool";
import { scriptedStream } from "./support/scripted-stream";

function detectPhase(messages: EngineContext["messages"]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const match = messages[i].content.match(/^Phase:\s*(\w+)/);
    if (match) return match[1];
  }
  return "chat";
}

test("Agent.run reuses one session for multi-turn direct responses", async () => {
  const routeContexts: string[][] = [];
  const stream: StreamFn = async function* directMultiTurnStream(model, context) {
    const phase = detectPhase(context.messages);
    if (phase !== "chat") {
      return;
    }

    routeContexts.push(context.messages.map((message) => message.content));
    const sawFirstAnswer = context.messages.some((message) => message.content.includes("First answer"));
    const message = sawFirstAnswer ? "Second answer saw the first turn." : "First answer";
    yield { type: "model_requested", model, usage: { inputMessages: context.messages.length } };
    yield { type: "structured_output", content: { route: "direct", message } };
    yield { type: "done" };
  };
  const agent = new Agent({
    context: createTestContext(),
    model: { provider: "test", name: "direct-multiturn" },
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
  expect(agent.state.context.messages.some((message) => message.metadata?.kind === "outcome")).toBe(false);
  expect(agent.state.context.messages.some((message) => message.content.includes("First answer"))).toBe(true);
  expect(routeContexts[1]).toEqual(
    expect.arrayContaining(["first", expect.stringContaining("First answer"), "second"]),
  );
  expect(events).toEqual(expect.arrayContaining(["chat_start"]));
});

test("Agent keeps conversation messages separate from execution steps", async () => {
  const routeContexts: string[][] = [];
  const events: string[] = [];
  const stream: StreamFn = async function* taskMultiTurnStream(model, context, options) {
    const phase = detectPhase(context.messages);
    if (phase === "chat") {
      routeContexts.push(context.messages.map((message) => message.content));
    }
    yield* scriptedStream(model, context, options);
  };
  const agent = new Agent({
    context: createTestContext({ tools: createEchoTools() }),
    model: { provider: "test", name: "scripted" },
    stream,
  });
  agent.subscribe((event) => {
    events.push(event.type);
  });

  const first = await runAgentTurn(agent, "use echo tool");
  const sessionId = agent.state.sessionId;
  const second = await runAgentTurn(agent, "use echo tool again");

  expect(first.outcome.passed).toBe(true);
  expect(second.outcome.passed).toBe(true);
  expect(agent.state.sessionId).toBe(sessionId);
  expect(routeContexts[1]).toEqual(
    expect.arrayContaining([
      "use echo tool",
      expect.stringContaining("Task passed"),
      "use echo tool again",
    ]),
  );
  expect(agent.state.context.messages.some((message) => message.content === "Task passed: Use echo tool")).toBe(true);
  expect(
    agent.state.context.messages.some(
      (message) => message.role === "assistant" && message.metadata?.kind === "routing_decision",
    ),
  ).toBe(false);
  expect(
    agent.state.context.messages.some(
      (message) => message.role === "assistant" && message.metadata?.kind === "model_message",
    ),
  ).toBe(false);
  expect(
    agent.state.context.messages.some(
      (message) => message.role === "assistant" && message.metadata?.kind === "outcome",
    ),
  ).toBe(false);
  expect(events).toEqual(expect.arrayContaining(["tool_execution_start", "tool_execution_end"]));
});

test("Agent does not carry failed task outcomes into later turns", async () => {
  const routeOutcomeContexts: string[][] = [];
  const stream: StreamFn = async function* failedThenDirectStream(model, context) {
    const phase = detectPhase(context.messages);

    if (phase === "chat") {
      const outcomeMessages = context.messages
        .filter((message) => message.role === "assistant" && message.content.includes("Missing some functions"))
        .map((message) => message.content);
      routeOutcomeContexts.push(outcomeMessages);
      const hasFailedOutcome = outcomeMessages.some((m) => m.includes("Missing some functions to finish the task"));
      // Extract current user request from the phase prompt, not the full prompt
      const lastUserMsg = context.messages.filter((m) => m.role === "user").pop()?.content ?? "";
      const currentRequest = lastUserMsg.match(/Current user request:\s*\n"([^"]+)"/)?.[1] ?? "";
      const route = currentRequest.includes("trigger failure") || hasFailedOutcome ? "plan" : "direct";
      const message = hasFailedOutcome ? "Polluted by failed outcome." : "Recovered direct answer.";

      yield { type: "model_requested", model, usage: { inputMessages: context.messages.length } };
      yield { type: "structured_output", content: { route, message } };
      yield { type: "done" };
      return;
    }

    if (phase === "plan") {
      yield {
        type: "structured_output",
        content: {
          id: createId("task"),
          title: "Fail once",
          instruction: "Return a failed verification result.",
          acceptanceCriteria: createDefaultCriteria("The task should fail."),
          toolNames: [],
          skillIds: [],
          status: "pending",
          attempts: 0,
        },
      };
      yield { type: "done" };
      return;
    }

    if (phase === "execute") {
      yield { type: "text_delta", text: "No tool output." };
      yield { type: "done" };
      return;
    }

    yield {
      type: "structured_output",
      content: { passed: false, message: "Missing some functions to finish the task" },
    };
    yield { type: "done" };
  };
  const agent = new Agent({
    context: createTestContext(),
    model: { provider: "test", name: "failed-then-direct" },
    stream,
    maxAttempts: 1,
  });

  const first = await runAgentTurn(agent, "trigger failure");
  const second = await runAgentTurn(agent, "hello");

  expect(first.outcome.passed).toBe(false);
  expect(first.outcome.message).toBe("Missing some functions to finish the task");
  expect(second.outcome.passed).toBe(true);
  expect(second.outcome.message).toBe("Recovered direct answer.");
  expect(routeOutcomeContexts[1]).not.toContain("Missing some functions to finish the task");
  expect(
    agent.state.context.messages.some(
      (message) =>
        message.role === "assistant" &&
        message.metadata?.kind === "outcome" &&
        message.content === "Missing some functions to finish the task",
    ),
  ).toBe(false);
});
