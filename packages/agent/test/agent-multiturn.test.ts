import { expect, test } from "bun:test";
import { latestUserInput, type Session } from "@rowan-agent/session";
import { Agent, InMemoryAgentStore, type AgentEvent, type StreamFn } from "../src";
import { createDefaultCriteria } from "../src/task";
import { createId } from "../src/types";
import { createEchoTools } from "./support/echo-tool";
import { scriptedStream } from "./support/scripted-stream";

type AgentSession = Session<AgentEvent>;

test("Agent.prompt reuses one session for multi-turn direct responses", async () => {
  const routeContexts: string[][] = [];
  const stream: StreamFn = async function* directMultiTurnStream(model, context) {
    if (context.phase !== "route") {
      return;
    }

    routeContexts.push(context.session.messages.map((message) => message.content));
    const sawFirstAnswer = context.session.messages.some((message) => message.content.includes("First answer"));
    const message = sawFirstAnswer ? "Second answer saw the first turn." : "First answer";
    yield { type: "model_requested", phase: "route", model, usage: { inputMessages: context.session.messages.length } };
    yield { type: "structured_output", content: { route: "direct", message } };
    yield { type: "done" };
  };
  const agent = new Agent({
    systemPrompt: "Test system",
    model: { provider: "test", name: "direct-multiturn" },
    stream,
  });
  const events: string[] = [];
  agent.subscribe((event) => {
    events.push(event.type);
  });

  const first = await agent.prompt("first");
  const sessionId = agent.state.session?.id;
  const second = await agent.prompt("second");

  expect(first.message).toBe("First answer");
  expect(second.message).toBe("Second answer saw the first turn.");
  expect(agent.state.session?.id).toBe(sessionId);
  expect(agent.state.session?.messages.filter((message) => message.role === "user")).toHaveLength(2);
  expect(agent.state.session?.messages.some((message) => message.metadata?.kind === "outcome")).toBe(false);
  expect(agent.state.session?.messages.some((message) => message.content.includes("First answer"))).toBe(true);
  expect(routeContexts[1]).toEqual(
    expect.arrayContaining(["first", expect.stringContaining("First answer"), "second"]),
  );
  expect(events).toEqual(expect.arrayContaining(["session_created"]));
  expect(events).not.toContain("session_loaded");
});

test("Agent keeps conversation messages separate from execution steps", async () => {
  const store = new InMemoryAgentStore<AgentSession>();
  const routeContexts: string[][] = [];
  const stream: StreamFn = async function* taskMultiTurnStream(model, context, options) {
    if (context.phase === "route" && !context.session.parentSessionId) {
      routeContexts.push(context.session.messages.map((message) => message.content));
    }
    yield* scriptedStream(model, context, options);
  };
  const agent = new Agent({
    systemPrompt: "Test system",
    model: { provider: "test", name: "scripted" },
    stream,
    tools: createEchoTools(),
    agentStore: store,
  });

  const first = await agent.prompt("use echo tool");
  const sessionId = agent.state.session?.id;
  const second = await agent.prompt("use echo tool again");
  const loaded = sessionId ? await store.load(sessionId) : undefined;

  expect(first.passed).toBe(true);
  expect(second.passed).toBe(true);
  expect(agent.state.session?.id).toBe(sessionId);
  expect(routeContexts[1]).toEqual(
    expect.arrayContaining([
      "use echo tool",
      expect.stringContaining("Task passed"),
      "use echo tool again",
    ]),
  );
  expect(loaded?.messages.some((message) => message.content === "Task passed: Use echo tool")).toBe(true);
  expect(
    loaded?.messages.some(
      (message) => message.role === "assistant" && message.metadata?.kind === "routing_decision",
    ),
  ).toBe(false);
  expect(
    loaded?.messages.some(
      (message) => message.role === "assistant" && message.metadata?.kind === "model_message",
    ),
  ).toBe(false);
  expect(
    loaded?.messages.some(
      (message) => message.role === "assistant" && message.metadata?.kind === "outcome",
    ),
  ).toBe(false);
  const steps = sessionId ? await store.loadSteps(sessionId) : [];
  expect(steps.some((step) => step.phase === "route")).toBe(true);
  expect(steps.some((step) => step.phase === "execute")).toBe(true);
  expect(steps.some((step) => step.entries.some((entry) => entry.kind === "tool_result"))).toBe(true);
});

test("Agent does not carry failed task outcomes into later turns", async () => {
  const routeOutcomeContexts: string[][] = [];
  const stream: StreamFn = async function* failedThenDirectStream(model, context) {
    if (context.phase === "route") {
      const outcomeMessages = context.session.messages
        .filter((message) => message.role === "assistant" && message.metadata?.kind === "outcome")
        .map((message) => message.content);
      routeOutcomeContexts.push(outcomeMessages);
      const hasFailedOutcome = outcomeMessages.includes("Missing some functions to finish the task");
      const route = latestUserInput(context.session) === "trigger failure" || hasFailedOutcome ? "task" : "direct";
      const message = hasFailedOutcome ? "Polluted by failed outcome." : "Recovered direct answer.";

      yield { type: "model_requested", phase: "route", model, usage: { inputMessages: context.session.messages.length } };
      yield { type: "structured_output", content: { route, message } };
      yield { type: "done" };
      return;
    }

    if (context.phase === "plan") {
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

    if (context.phase === "execute") {
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
    systemPrompt: "Test system",
    model: { provider: "test", name: "failed-then-direct" },
    stream,
    maxAttempts: 1,
  });

  const first = await agent.prompt("trigger failure");
  const second = await agent.prompt("hello");

  expect(first.passed).toBe(false);
  expect(first.message).toBe("Missing some functions to finish the task");
  expect(second.passed).toBe(true);
  expect(second.message).toBe("Recovered direct answer.");
  expect(routeOutcomeContexts[1]).not.toContain("Missing some functions to finish the task");
  expect(
    agent.state.session?.messages.some(
      (message) =>
        message.role === "assistant" &&
        message.metadata?.kind === "outcome" &&
        message.content === "Missing some functions to finish the task",
    ),
  ).toBe(false);
});
