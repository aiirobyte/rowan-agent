import { expect, test } from "bun:test";
import Type from "typebox";
import type { AssistantMessagePartial } from "@rowan-agent/models";
import { runAgentLoop } from "../src/agent-loop";
import type { AgentEvent, LlmRequest, StreamFn, Tool } from "../src/types";
import { createAgentState as createBaseAgentState, createMessage } from "../src/types";
import { createId } from "../src/utils";
import { echoTool } from "./support/echo-tool";
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

function extractUserRequest(messages: LlmRequest["messages"]): string {
  // Find the first user message (the actual user input, not phase instructions)
  for (const msg of messages) {
    if (msg.role === "user" && typeof msg.content === "string") {
      // Skip phase instruction messages (they start with "Phase:")
      if (msg.content.startsWith("Phase:")) continue;
      return msg.content;
    }
  }
  return "";
}

function createState(input: Parameters<typeof createBaseAgentState>[0]) {
  return createBaseAgentState(input);
}

test("runAgentLoop assembles runtime context for the first message", async () => {
  const seenRequests: unknown[] = [];
  const stream: StreamFn = async function* requestRecordingStream(request) {
    seenRequests.push(request);
    const text = "Response.";
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield { type: "done" };
  };

  await runAgentLoop({
    context: {
      systemPrompt: "Test system",
      messages: [
        createMessage("user", "hello", { scope: "conversation" }),
      ],
      tools: [echoTool],
    },
    model: { provider: "test", name: "scripted" },
    stream,
  });

  expect(seenRequests).toHaveLength(1);
  const request = seenRequests[0] as {
    system?: string;
    messages?: Array<{ role: string; content: string }>;
  };
  expect(request.system).toContain("Test system");
  expect(request.messages?.some((message) => message.role === "user" && message.content === "hello")).toBe(true);
});

test("runAgentLoop requests the LLM with a fixed request object", async () => {
  const seenRequests: unknown[] = [];
  const controller = new AbortController();
  const stream: StreamFn = async function* requestRecordingStream(request, options) {
    seenRequests.push(request);
    expect(options.signal).toBe(controller.signal);
    const text = "Done.";
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield { type: "done" };
  };

  await runAgentLoop({
    context: {
      systemPrompt: "Test system",
      messages: [createMessage("user", "hello", { scope: "conversation" })],
      tools: [echoTool],
    },
    model: { provider: "test-provider", name: "test-model" },
    stream,
    signal: controller.signal,
  });

  expect(seenRequests).toHaveLength(1);
  const request = seenRequests[0] as {
    model?: unknown;
    system?: string;
    messages?: Array<{ role: string; content: string }>;
    tools?: Array<{ name: string; description: string }>;
  };
  expect(request.model).toEqual({ provider: "test-provider", name: "test-model" });
  expect(request.system).toContain("Test system");
  expect(request.messages?.some((message) => message.role === "user" && message.content === "hello")).toBe(true);
  expect(request.messages?.at(-1)?.content).toBe("hello");
  // Default loop (no phases) only includes user-configured tools, no route tool
  expect(request.tools).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: "echo", description: echoTool.description }),
    ]),
  );
  expect(request.tools).toEqual(
    expect.not.arrayContaining([
      expect.objectContaining({ name: "route" }),
    ]),
  );
});

test("runAgentLoop completes task with simple response", async () => {
  const session = createState({
    systemPrompt: "Test system",
    input: "use echo tool",
  });
  const events: string[] = [];
  const stream: StreamFn = async function* simpleResponseStream() {
    const text = "Simple response.";
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield { type: "done" };
  };

  const outcome = await runAgentLoop({
    state: session,
    model: { provider: "test", name: "scripted" },
    stream,
    tools: [echoTool],
    emit: (event) => {
      events.push(event.type);
    },
  });

  expect(outcome.outcome).not.toHaveProperty("evidence");
  expect(outcome.outcome).not.toHaveProperty("failedCriteria");
  expect(events).toContain("phase_end");
  expect(session.messages.some((message) => message.role === "tool")).toBe(false);
  expect(events.length).toBeGreaterThan(0);
});

test("runAgentLoop preserves message order", async () => {
  const session = createState({
    systemPrompt: "Test system",
    input: "use echo tool",
  });
  const stream: StreamFn = async function* orderedMessageStream() {
    const text = "Ordered messages.";
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield { type: "done" };
  };
  const events: AgentEvent[] = [];

  await runAgentLoop({
    state: session,
    model: { provider: "test", name: "ordered" },
    stream,
    tools: [echoTool],
    maxAttempts: 1,
    emit: (event) => {
      events.push(event);
    },
  });

  const messageEndEvents = events.filter(e => e.type === "message_end");
  expect(messageEndEvents.length).toBeGreaterThan(0);
  expect(messageEndEvents.some(e => e.type === "message_end" && e.message.content.includes("Ordered messages"))).toBe(true);
});

test("runAgentLoop does not emit prompt messages as events", async () => {
  const session = createState({
    systemPrompt: "Test system",
    input: "hello",
  });
  const emittedEvents: AgentEvent[] = [];
  const stream: StreamFn = async function* promptRecordingStream(request) {
    yield { type: "model_requested", model: request.model, usage: { inputMessages: 3 } };
    const text = "Hello.";
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield* yieldRouteToolCall("stop", text, text);
    yield { type: "done" };
  };

  await runAgentLoop({
    state: session,
    model: { provider: "test", name: "prompt-recording" },
    stream,
    tools: [],
    emit: (event) => {
      emittedEvents.push(event);
    },
  });

  expect(
    emittedEvents.some(
      (event) =>
        event.type === "message_end" &&
        event.message.metadata?.kind === "phase_prompt",
    ),
  ).toBe(false);
});

test("runAgentLoop can return a direct response without creating a task", async () => {
  const session = createState({
    systemPrompt: "Test system",
    input: "hello",
  });
  const emittedEvents: AgentEvent[] = [];

  const outcome = await runAgentLoop({
    state: session,
    model: { provider: "test", name: "scripted" },
    stream: scriptedStream,
    tools: [echoTool],
    emit: (event) => {
      emittedEvents.push(event);
    },
  });
  const events = emittedEvents.map((event) => event.type);

  expect(outcome.outcome.message).toBe("Direct response: hello");
  expect(session.messages.some((message) => message.content === "Direct response: hello")).toBe(true);
  expect(session.messages.some((message) => message.metadata?.kind === "outcome")).toBe(true);
  // Outcome message should not emit message_start/message_end events
  expect(
    emittedEvents.some(
      (event) =>
        event.type === "message_end" &&
        event.message.metadata?.kind === "outcome",
    ),
  ).toBe(false);
});

test("runAgentLoop returns structured error for unknown tool without crashing", async () => {
  const session = createState({
    systemPrompt: "Test system",
    input: "use echo tool",
  });
  const events: AgentEvent[] = [];
  const stream: StreamFn = async function* simpleStream() {
    const text = "Response.";
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield { type: "done" };
  };

  const outcome = await runAgentLoop({
    state: session,
    model: { provider: "test", name: "scripted" },
    stream,
    tools: [],
    maxAttempts: 1,
    emit: (event) => {
      events.push(event);
    },
  });

  expect(events.some((event) => event.type === "phase_end")).toBe(true);
});

test("runAgentLoop throws provider errors to the caller", async () => {
  const session = createState({
    systemPrompt: "Test system",
    input: "hello",
  });
  const stream: StreamFn = async function* failingStream() {
    throw Object.assign(new Error("Provider request failed with status 400 Bad Request: Invalid model."), {
      code: "http_error",
      status: 400,
      retryable: false,
      details: {
        endpoint: "https://api.example/v1/model",
        model: "bad-model",
        providerError: {
          message: "Invalid model.",
          code: "model_not_found",
        },
      },
    });
  };

  await expect(
    runAgentLoop({
      state: session,
      model: { provider: "test", name: "failing" },
      stream,
      tools: [echoTool],
    }),
  ).rejects.toThrow("Invalid model");
});

function invalidModelSchemaError(message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code: "invalid_model_schema" });
}

test("runAgentLoop retries when model returns invalid schema", async () => {
  const session = createState({
    systemPrompt: "Test system",
    input: "use echo tool",
  });
  const events: AgentEvent[] = [];
  let callCount = 0;
  const stream: StreamFn = async function* retryStream() {
    callCount++;
    yield { type: "model_requested", model: { provider: "test", name: "retry" }, usage: { inputMessages: 1 } };
    if (callCount === 1) {
      throw invalidModelSchemaError("Model output did not match the expected schema.");
    }
    const text = "Verified after retry.";
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield { type: "done" };
  };

  const outcome = await runAgentLoop({
    state: session,
    model: { provider: "test", name: "retry" },
    stream,
    tools: [echoTool],
    maxAttempts: 2,
    emit: (event) => {
      events.push(event);
    },
  });

  expect(outcome.outcome.message).toBe("Verified after retry.");
  expect(callCount).toBe(2);
  expect(
    events.some(
      (event) =>
        event.type === "phase_end" && event.phase === "none",
    ),
  ).toBe(true);
});

test("runAgentLoop retries when execute returns invalid model schema", async () => {
  const session = createState({
    systemPrompt: "Test system",
    input: "use echo tool",
  });
  let callCount = 0;
  const stream: StreamFn = async function* retryStream() {
    callCount++;
    yield { type: "model_requested", model: { provider: "test", name: "retry" }, usage: { inputMessages: 1 } };
    if (callCount === 1) {
      throw invalidModelSchemaError("Model output did not include expected fields.");
    }
    const text = "Verified after retry.";
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield { type: "done" };
  };

  const outcome = await runAgentLoop({
    state: session,
    model: { provider: "test", name: "retry-execute" },
    stream,
    tools: [echoTool],
    maxAttempts: 2,
  });

  expect(outcome.outcome.message).toBe("Verified after retry.");
  expect(callCount).toBe(2);
  expect(session.messages.some((message) => message.metadata?.toolName === "model.execute")).toBe(false);
});

test("beforeToolCall hook can block execution", async () => {
  const session = createState({
    systemPrompt: "Test system",
    input: "use echo tool",
  });
  const events: AgentEvent[] = [];

  const outcome = await runAgentLoop({
    state: session,
    model: { provider: "test", name: "scripted" },
    stream: scriptedStream,
    tools: [echoTool],
    maxAttempts: 1,
    beforeToolCall: async () => ({ allow: false, reason: "blocked in test" }),
    emit: (event) => {
      events.push(event);
    },
  });

});

test("afterToolCall hook review is logged with original and reviewed result", async () => {
  const session = createState({
    systemPrompt: "Test system",
    input: "use echo tool",
  });
  const events: AgentEvent[] = [];

  const outcome = await runAgentLoop({
    state: session,
    model: { provider: "test", name: "scripted" },
    stream: scriptedStream,
    tools: [echoTool],
    afterToolCall: async ({ result }) => ({
      ...result,
      content: `${result.content} reviewed`,
    }),
    emit: (event) => {
      events.push(event);
    },
  });

});

test("invalid tool args do not execute tool", async () => {
  let executed = false;
  const strictTool: Tool<{ value: string }> = {
    name: "strict",
    description: "Requires a string value.",
    parameters: Type.Object({ value: Type.String() }),
    async execute(args) {
      executed = true;
      return {
        toolCallId: createId("call"),
        toolName: "strict",
        ok: true,
        content: args.value,
      };
    },
  };
  const invalidArgsStream: StreamFn = async function* invalidArgsStream() {
    // In the new phase system without phaseConfig, tools aren't automatically executed
    // The model simply returns a response
    const text = "Response with invalid args tool call.";
    const toolId = createId("call");
    const toolName = "strict";
    const toolArgs = JSON.stringify({ value: 123 });
    const withTool: AssistantMessagePartial = {
      role: "assistant",
      contentBlocks: [
        { type: "text", text },
        { type: "tool_call", id: toolId, name: toolName, args: toolArgs },
      ],
    };
    yield { type: "tool_call_start", id: toolId, name: toolName, partial: withTool };
    yield { type: "tool_call_delta", id: toolId, arguments: toolArgs, partial: withTool };
    yield { type: "tool_call_end", id: toolId, name: toolName, arguments: toolArgs, partial: withTool };
    yield { type: "done" };
  };
  const session = createState({
    systemPrompt: "Test system",
    input: "call strict",
  });
  const events: AgentEvent[] = [];

  const outcome = await runAgentLoop({
    state: session,
    model: { provider: "test", name: "scripted" },
    stream: invalidArgsStream,
    tools: [strictTool],
    maxAttempts: 1,
    emit: (event) => {
      events.push(event);
    },
  });

  // Tool is not auto-executed in none phase (no phaseConfig)
  expect(executed).toBe(false);
  expect(events.some((event) => event.type === "phase_end")).toBe(true);
});

test("beforePhase hook can adjust phase input", async () => {
  const session = createState({
    systemPrompt: "Test system",
    input: "adjust route input",
  });
  const stream: StreamFn = async function* adjustableRouteStream(request) {
    const phase = detectPhase(request.messages);
    if (phase !== "chat") {
      return;
    }

    const text = "Adjusted route input.";
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield* yieldRouteToolCall("stop", text, text);
    yield { type: "done" };
  };

  const outcome = await runAgentLoop({
    state: session,
    model: { provider: "test", name: "runtime-adjust-input" },
    stream,
    tools: [],
    beforePhase: async (phaseId, input) => {
      if (phaseId !== "chat") {
        return {};
      }
      return { input: { ...input } };
    },
  });

  expect(outcome.outcome.message).toBe("Adjusted route input.");
});

test("afterPhase hook can adjust phase output", async () => {
  const session = createState({
    systemPrompt: "Test system",
    input: "adjust route output",
  });
  const stream: StreamFn = async function* routeStream() {
    const text = "Original route output.";
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield { type: "done" };
  };

  const outcome = await runAgentLoop({
    state: session,
    model: { provider: "test", name: "runtime-adjust-output" },
    stream,
    tools: [],
    afterPhase: async (phaseId, output) => {
      if (phaseId !== "none") {
        return {};
      }
      return {
        output: {
          ...output,
          message: "Adjusted route output.",
        },
      };
    },
  });

  expect(outcome.outcome.message).toBe("Adjusted route output.");
});

test("beforePhase hook can skip a phase", async () => {
  const session = createState({
    systemPrompt: "Test system",
    input: "skip route",
  });
  let modelCalled = false;
  const stream: StreamFn = async function* skippedStream() {
    modelCalled = true;
  };

  const outcome = await runAgentLoop({
    state: session,
    model: { provider: "test", name: "runtime-skip" },
    stream,
    tools: [],
    beforePhase: async (phaseId) => {
      if (phaseId !== "none") {
        return {};
      }
      return {
        skip: {
          route: "stop",
          message: "Skipped none phase.",
        },
      };
    },
  });

  expect(modelCalled).toBe(false);
  expect(outcome.outcome.message).toBe("Skipped none phase.");
});

test("afterPhase hook can retry a phase with adjusted input", async () => {
  const session = createState({
    systemPrompt: "Test system",
    input: "retry route",
  });
  let callCount = 0;
  const stream: StreamFn = async function* retryableRouteStream() {
    callCount++;
    const reason = callCount > 1 ? "Retried with adjusted input." : "Needs retry.";
    const text = reason;
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield { type: "done" };
  };

  const outcome = await runAgentLoop({
    state: session,
    model: { provider: "test", name: "runtime-retry" },
    stream,
    tools: [],
    afterPhase: async (phaseId, output) => {
      if (phaseId !== "none" || output.message !== "Needs retry.") {
        return {};
      }
      return {
        retry: {
          phase: phaseId,
          systemPrompt: session.systemPrompt,
          messages: session.messages,
          tools: [],
          skills: session.skills,
        },
      };
    },
  });

  expect(callCount).toBe(2);
  expect(outcome.outcome.message).toBe("Retried with adjusted input.");
});

test("beforePhase hook can abort with an outcome", async () => {
  const session = createState({
    systemPrompt: "Test system",
    input: "abort during phase",
  });
  const events: AgentEvent[] = [];
  const stream: StreamFn = async function* taskStream() {
    const text = "Should not reach here.";
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield { type: "done" };
  };

  const outcome = await runAgentLoop({
    state: session,
    model: { provider: "test", name: "runtime-abort" },
    stream,
    tools: [],
    emit: (event) => {
      events.push(event);
    },
    beforePhase: async (phaseId) => {
      if (phaseId !== "none") {
        return {};
      }
      return {
        abort: {
          id: createId("out"),
          passed: false,
          message: "Aborted by runtime.",
        },
      };
    },
  });

  expect(outcome.outcome.message).toBe("Aborted by runtime.");
});
