import { expect, test } from "bun:test";
import { Agent, createMessage, messageContentText, type StreamFn } from "../src";
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

test("Agent exposes high-level message continuation helpers", async () => {
  const seenUserInputs: string[] = [];
  const stream: StreamFn = async function* continuationStream(request) {
    const userMessages = request.messages
      .filter((message) => message.role === "user")
      .map((message) => messageContentText(message.content));
    const currentInput = userMessages[userMessages.length - 1] ?? "";
    seenUserInputs.push(currentInput);
    const text = `Answer to ${currentInput}`;
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield { type: "done" };
  };
  const agent = new Agent({
    context: createTestContext(),
    model: { provider: "test", id: "continuation-helpers" },
    stream,
  });

  const first = await agent.runWithUserInput("hello");
  const sessionId = agent.getSessionId();
  agent.appendUserMessage("queued only");
  expect(seenUserInputs).toEqual(["hello"]);
  const second = await agent.run();
  await agent.runWithMessage(createMessage("user", "pre-built"));

  expect(first.outcome.message).toBe("Answer to hello");
  expect(second.outcome.message).toBe("Answer to queued only");
  expect(agent.getSessionId()).toBe(sessionId);
  expect(seenUserInputs).toEqual(["hello", "queued only", "pre-built"]);
  expect(agent.getMessages().filter((message) => message.role === "user")).toHaveLength(3);
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

test("Agent.runWithUserInput resumes a paused planning phase and only resolves on route:stop", async () => {
  // Two-phase registry: planning (chatty, often no route) + execute.
  const phases = new Map<string, any>();
  phases.set("plan", { id: "plan", name: "plan", description: "plan", filePath: "", baseDir: "", content: "Plan." });
  phases.set("execute", { id: "execute", name: "execute", description: "execute", filePath: "", baseDir: "", content: "Execute." });
  const agent = new Agent({
    context: { systemPrompt: "Test", messages: [], tools: [], skills: [], phases: { phases, entryPhaseId: "plan" } },
    model: { provider: "test", id: "hitl" },
    stream: (async function* (request) {
      const userTexts = request.messages
        .filter((m: any) => m.role === "user" && typeof m.content === "string" && !m.content.startsWith("Phase:"))
        .map((m: any) => m.content as string);
      const last = userTexts[userTexts.length - 1] ?? "";
      if (last === "plan this") {
        // Missing route → pause for human input.
        yield { type: "text_delta", text: "need details", partial: buildTestPartial("need details") };
        yield { type: "done" };
        return;
      }
      if (last === "go") {
        // Explicit route:stop → run() resolves.
        yield { type: "text_delta", text: "all done", partial: buildTestPartial("all done") };
        yield* yieldRouteToolCall("stop", "all done", "all done");
        yield { type: "done" };
      }
    }) as StreamFn,
  });

  const events: string[] = [];
  let resolvePause!: () => void;
  const paused = new Promise<void>((resolve) => {
    resolvePause = resolve;
  });
  agent.subscribe((event) => {
    events.push(event.type);
    if (
      event.type === "message_end" &&
      messageContentText(event.message.content) === "need details"
    ) {
      resolvePause();
    }
  });

  // First call: pauses inside run() (missing route). Do NOT await yet.
  const runPromise = agent.runWithUserInput("plan this");
  await paused;
  await new Promise((resolve) => setTimeout(resolve, 0));

  // A rejected concurrent run must not replace the paused run's input channel.
  await expect(agent.run()).rejects.toThrow("Agent is already running.");

  // Resume through the public interface; both callers observe the same result.
  const resumedPromise = agent.runWithUserInput("go");
  const finalResult = await Promise.all([
    runPromise,
    resumedPromise,
  ]).then(([initialResult, resumedResult]) => {
    expect(resumedResult).toEqual(initialResult);
    return initialResult;
  });

  expect(finalResult.outcome.message).toBe("all done");
  // The transcript contains both user inputs within ONE run.
  const userTexts = agent.getMessages().filter((m) => m.role === "user").map((m) => messageContentText(m.content));
  expect(userTexts).toEqual(["plan this", "go"]);
  expect(events).toEqual(expect.arrayContaining(["message_end", "phase_end"]));
});

test("Agent propagates a resumed run failure to both callers", async () => {
  const phases = new Map<string, any>();
  phases.set("plan", { id: "plan", name: "plan", description: "plan", filePath: "", baseDir: "", content: "Plan." });
  phases.set("execute", { id: "execute", name: "execute", description: "execute", filePath: "", baseDir: "", content: "Execute." });
  const agent = new Agent({
    context: { systemPrompt: "Test", messages: [], tools: [], skills: [], phases: { phases, entryPhaseId: "plan" } },
    model: { provider: "test", id: "hitl-failure" },
    stream: (async function* (request) {
      const userTexts = request.messages
        .filter((message: any) => message.role === "user" && typeof message.content === "string")
        .map((message: any) => message.content as string);
      if (userTexts.at(-1) === "go") {
        throw new Error("provider failed after resume");
      }
      yield { type: "text_delta", text: "need details", partial: buildTestPartial("need details") };
      yield { type: "done" };
    }) as StreamFn,
  });

  let resolvePause!: () => void;
  const paused = new Promise<void>((resolve) => {
    resolvePause = resolve;
  });
  agent.subscribe((event) => {
    if (
      event.type === "message_end" &&
      messageContentText(event.message.content) === "need details"
    ) {
      resolvePause();
    }
  });

  const initialPromise = agent.runWithUserInput("plan this");
  await paused;
  await new Promise((resolve) => setTimeout(resolve, 0));
  const resumedPromise = agent.runWithUserInput("go");

  const results = await Promise.allSettled([initialPromise, resumedPromise]);
  expect(results).toHaveLength(2);
  for (const result of results) {
    expect(result.status).toBe("rejected");
    if (result.status === "rejected") {
      expect(result.reason).toBeInstanceOf(Error);
      expect(result.reason.message).toBe("provider failed after resume");
    }
  }
});
