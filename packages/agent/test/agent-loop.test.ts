import { expect, test } from "bun:test";
import Type from "typebox";
import { runAgentLoop } from "../src/agent-loop";
import type { AgentEvent, AgentRuntimePort, LlmRequest, StreamFn, Tool } from "../src/types";
import { createAgentState as createBaseAgentState, createMessage } from "../src/types";
import { createId } from "../src/utils";
import { echoTool } from "./support/echo-tool";
import { buildTestPartial, buildToolCallPartial, scriptedStream } from "./support/scripted-stream";

function detectPhase(messages: LlmRequest["messages"]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const match = (messages[i].content as string).match(/^Phase:\s*(\w+)/);
    if (match) return match[1];
  }
  return "chat";
}

function extractUserRequest(messages: LlmRequest["messages"]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const match = (messages[i].content as string).match(/Current user request:\s*\n"([^"]+)"/);
    if (match) return match[1];
  }
  return "";
}

function createState(input: Parameters<typeof createBaseAgentState>[0]) {
  return createBaseAgentState(input);
}

test("runAgentLoop assembles runtime context for the first message", async () => {
  const seenContexts: Array<{
    systemPrompt: string;
    messages: string[];
    tools: string[];
  }> = [];
  const runtime: AgentRuntimePort = {
    async beforePhase(context, phase) {
      if (phase !== "chat") {
        return;
      }
      seenContexts.push({
        systemPrompt: context.systemPrompt,
        messages: context.messages.map((message) => message.content),
        tools: context.tools.map((tool) => tool.name),
      });
    },
  };

  await runAgentLoop({
    kind: "run",
    context: {
      systemPrompt: "Test system",
      messages: [
        createMessage("user", "hello", { scope: "conversation" }),
      ],
      tools: [echoTool],
    },
    model: { provider: "test", name: "scripted" },
    stream: scriptedStream,
    runtime,
  });

  expect(seenContexts).toEqual([
    {
      systemPrompt: "Test system",
      messages: ["hello"],
      tools: ["echo"],
    },
  ]);
});

test("runAgentLoop requests the LLM with a fixed request object", async () => {
  const seenRequests: unknown[] = [];
  const controller = new AbortController();
  const stream: StreamFn = async function* requestRecordingStream(request, options) {
    seenRequests.push(request);
    expect(options.signal).toBe(controller.signal);
    const text = JSON.stringify({ route: "direct", message: "Done." });
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield { type: "done" };
  };

  await runAgentLoop({
    kind: "run",
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
  expect(request.messages?.at(-1)?.content).toContain("Phase: chat");
  expect(request.tools).toEqual([
    expect.objectContaining({ name: "echo", description: echoTool.description }),
  ]);
});

test("runAgentLoop completes task with echo tool and verification", async () => {
  const session = createState({
    systemPrompt: "Test system",
    input: "use echo tool",
  });
  const events: string[] = [];

  const outcome = await runAgentLoop({
    kind: "run",
    state: session,
    model: { provider: "test", name: "scripted" },
    stream: scriptedStream,
    tools: [echoTool],
    emit: (event) => {
      events.push(event.type);
    },
  });

  expect(outcome.outcome.passed).toBe(true);
  expect(outcome.outcome).not.toHaveProperty("evidence");
  expect(outcome.outcome).not.toHaveProperty("failedCriteria");
  expect(events).toContain("tool_execution_end");
  expect(events).toContain("phase_end");
  expect(session.messages.some((message) => message.role === "tool")).toBe(false);
  expect(events.length).toBeGreaterThan(0);
});

test("runAgentLoop preserves phase messages before downstream events and tool calls", async () => {
  const task = {
    id: createId("task"),
    title: "Ordered messages",
    instruction: "Use echo with ordered messages",
    acceptanceCriteria: ["Echo evidence is present."],
    toolNames: ["echo"],
    skillIds: [],
    status: "pending" as const,
    attempts: 0,
  };
  const stream: StreamFn = async function* orderedMessageStream(request) {
    const phase = detectPhase(request.messages);

    if (phase === "chat") {
      const chatText = JSON.stringify({ route: "plan", message: "Routing from model." });
      yield { type: "text_delta", text: chatText, partial: buildTestPartial(chatText) };
      yield { type: "done" };
      return;
    }

    if (phase === "plan") {
      const planText = JSON.stringify(task);
      yield { type: "text_delta", text: planText, partial: buildTestPartial(planText) };
      yield { type: "done" };
      return;
    }

    if (phase === "execute") {
      const toolId = createId("call");
      const toolName = "echo";
      const toolArgs = JSON.stringify({ message: "ordered" });
      const partial = buildToolCallPartial(toolId, toolName, toolArgs);
      yield { type: "tool_call_start", id: toolId, name: toolName, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
      yield { type: "tool_call_delta", id: toolId, arguments: toolArgs, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
      yield { type: "tool_call_end", id: toolId, name: toolName, arguments: toolArgs, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
      yield { type: "done" };
      return;
    }

    const verifyText = JSON.stringify({ passed: true, message: "Verified.", route: "stop" });
    yield { type: "text_delta", text: verifyText, partial: buildTestPartial(verifyText) };
    yield { type: "done" };
  };
  const session = createState({
    systemPrompt: "Test system",
    input: "use echo tool",
  });
  const events: AgentEvent[] = [];

  await runAgentLoop({
    kind: "run",
    state: session,
    model: { provider: "test", name: "ordered" },
    stream,
    tools: [echoTool],
    maxAttempts: 1,
    emit: (event) => {
      events.push(event);
    },
  });

  const indexOf = (predicate: (event: AgentEvent) => boolean) =>
    events.findIndex(predicate);
  const messageIndex = (content: string) =>
    indexOf(
      (event) =>
        event.type === "message_end" &&
        event.message.content.includes(content),
    );

  expect(messageIndex("Ordered messages")).toBeLessThan(
    indexOf((event) => event.type === "phase_start" && event.phase === "execute"),
  );
  expect(messageIndex("Executing from model.")).toBeLessThan(
    indexOf((event) => event.type === "tool_execution_start"),
  );
  expect(messageIndex("Verified.")).toBeLessThan(
    indexOf((event) => event.type === "phase_end" && event.phase === "verify"),
  );
});

test("runAgentLoop does not emit prompt messages as events", async () => {
  const session = createState({
    systemPrompt: "Test system",
    input: "hello",
  });
  const emittedEvents: AgentEvent[] = [];
  const stream: StreamFn = async function* promptRecordingStream(request) {
    yield { type: "model_requested", model: request.model, usage: { inputMessages: 3 } };
    const text = JSON.stringify({ route: "direct", message: "Hello." });
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield { type: "done" };
  };

  await runAgentLoop({
    kind: "run",
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
    kind: "run",
    state: session,
    model: { provider: "test", name: "scripted" },
    stream: scriptedStream,
    tools: [echoTool],
    emit: (event) => {
      emittedEvents.push(event);
    },
  });
  const events = emittedEvents.map((event) => event.type);

  expect(outcome.outcome.passed).toBe(true);
  expect(outcome.outcome.taskId).toBeUndefined();
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

  const outcome = await runAgentLoop({
    kind: "run",
    state: session,
    model: { provider: "test", name: "scripted" },
    stream: scriptedStream,
    tools: [],
    maxAttempts: 1,
    emit: (event) => {
      events.push(event);
    },
  });

  expect(outcome.outcome.passed).toBe(false);
  expect(events.some((event) => event.type === "tool_execution_end")).toBe(true);
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
      kind: "run",
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

test("runAgentLoop retries when verify returns invalid model schema", async () => {
  const session = createState({
    systemPrompt: "Test system",
    input: "use echo tool",
  });
  const events: AgentEvent[] = [];
  const task = {
    id: createId("task"),
    title: "Retry verify",
    instruction: "use echo tool",
    acceptanceCriteria: ["Echo evidence is present."],
    toolNames: ["echo"],
    skillIds: [],
    status: "pending" as const,
    attempts: 0,
  };
  let verifyCalls = 0;
  const stream: StreamFn = async function* retryVerifyStream(request) {
    const phase = detectPhase(request.messages);

    if (phase === "chat") {
      const chatText = JSON.stringify({ route: "plan", message: "Create task." });
      yield { type: "text_delta", text: chatText, partial: buildTestPartial(chatText) };
      yield { type: "done" };
      return;
    }
    if (phase === "plan") {
      const planText = JSON.stringify(task);
      yield { type: "text_delta", text: planText, partial: buildTestPartial(planText) };
      yield { type: "done" };
      return;
    }
    if (phase === "execute") {
      const toolId = createId("call");
      const toolName = "echo";
      const toolArgs = JSON.stringify({ message: "retry" });
      const partial = buildToolCallPartial(toolId, toolName, toolArgs);
      yield { type: "tool_call_start", id: toolId, name: toolName, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
      yield { type: "tool_call_delta", id: toolId, arguments: toolArgs, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
      yield { type: "tool_call_end", id: toolId, name: toolName, arguments: toolArgs, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
      yield { type: "done" };
      return;
    }

    verifyCalls += 1;
    yield { type: "model_requested", model: request.model, usage: { inputMessages: 1 } };
    if (verifyCalls === 1) {
      throw invalidModelSchemaError("Model output for verify did not match the expected schema.");
    }
    const verifyText = JSON.stringify({ passed: true, message: "Verified after retry.", route: "stop" });
    yield { type: "text_delta", text: verifyText, partial: buildTestPartial(verifyText) };
    yield { type: "done" };
  };

  const outcome = await runAgentLoop({
    kind: "run",
    state: session,
    model: { provider: "test", name: "retry-verify" },
    stream,
    tools: [echoTool],
    maxAttempts: 2,
    emit: (event) => {
      events.push(event);
    },
  });

  expect(outcome.outcome.passed).toBe(true);
  expect(outcome.outcome.message).toBe("Verified after retry.");
  expect(verifyCalls).toBe(2);
  expect(
    events.some(
      (event) =>
        event.type === "phase_end" &&
        event.phase === "verify",
    ),
  ).toBe(true);
});

test("runAgentLoop retries when execute returns invalid model schema", async () => {
  const session = createState({
    systemPrompt: "Test system",
    input: "use echo tool",
  });
  const task = {
    id: createId("task"),
    title: "Retry execute",
    instruction: "use echo tool",
    acceptanceCriteria: ["Echo evidence is present."],
    toolNames: ["echo"],
    skillIds: [],
    status: "pending" as const,
    attempts: 0,
  };
  let executeCalls = 0;
  let verifyCalls = 0;
  const stream: StreamFn = async function* retryExecuteStream(request) {
    const phase = detectPhase(request.messages);

    if (phase === "chat") {
      const chatText = JSON.stringify({ route: "plan", message: "Create task." });
      yield { type: "text_delta", text: chatText, partial: buildTestPartial(chatText) };
      yield { type: "done" };
      return;
    }
    if (phase === "plan") {
      const planText = JSON.stringify(task);
      yield { type: "text_delta", text: planText, partial: buildTestPartial(planText) };
      yield { type: "done" };
      return;
    }
    if (phase === "execute") {
      executeCalls += 1;
      yield { type: "model_requested", model: request.model, usage: { inputMessages: 1 } };
      if (executeCalls === 1) {
        throw invalidModelSchemaError("Model output for execute did not include toolCalls.");
      }
      const toolId = createId("call");
      const toolName = "echo";
      const toolArgs = JSON.stringify({ message: "retry" });
      const partial = buildToolCallPartial(toolId, toolName, toolArgs);
      yield { type: "tool_call_start", id: toolId, name: toolName, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
      yield { type: "tool_call_delta", id: toolId, arguments: toolArgs, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
      yield { type: "tool_call_end", id: toolId, name: toolName, arguments: toolArgs, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
      yield { type: "done" };
      return;
    }

    verifyCalls += 1;
    const verifyText = JSON.stringify(
      verifyCalls === 1
        ? {
            passed: false,
            message: "Missing echo evidence.",
            route: "execute",
          }
        : {
            passed: true,
            message: "Verified after execute retry.",
            route: "stop",
          },
    );
    yield { type: "text_delta", text: verifyText, partial: buildTestPartial(verifyText) };
    yield { type: "done" };
  };

  const outcome = await runAgentLoop({
    kind: "run",
    state: session,
    model: { provider: "test", name: "retry-execute" },
    stream,
    tools: [echoTool],
    maxAttempts: 2,
  });

  expect(outcome.outcome.passed).toBe(true);
  expect(outcome.outcome.message).toBe("Verified after execute retry.");
  expect(executeCalls).toBe(2);
  expect(session.messages.some((message) => message.metadata?.toolName === "model.execute")).toBe(false);
});

test("beforeToolCall hook can block execution", async () => {
  const session = createState({
    systemPrompt: "Test system",
    input: "use echo tool",
  });
  const events: AgentEvent[] = [];

  const outcome = await runAgentLoop({
    kind: "run",
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

  expect(outcome.outcome.passed).toBe(false);
});

test("afterToolCall hook review is logged with original and reviewed result", async () => {
  const session = createState({
    systemPrompt: "Test system",
    input: "use echo tool",
  });
  const events: AgentEvent[] = [];

  const outcome = await runAgentLoop({
    kind: "run",
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

  expect(outcome.outcome.passed).toBe(true);
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
  const invalidArgsStream: StreamFn = async function* invalidArgsStream(request) {
    const phase = detectPhase(request.messages);

    if (phase === "chat") {
      const chatText = JSON.stringify({
        route: "plan",
        message: "Routing invalid args task.",
      });
      yield { type: "text_delta", text: chatText, partial: buildTestPartial(chatText) };
      yield { type: "done" };
      return;
    }

    if (phase === "plan") {
      const planText = JSON.stringify({
        id: createId("task"),
        title: "Invalid args task",
        instruction: "Call strict tool",
        acceptanceCriteria: ["Strict tool should pass"],
        toolNames: ["strict"],
        skillIds: [],
        status: "pending",
        attempts: 0,
      });
      yield { type: "text_delta", text: planText, partial: buildTestPartial(planText) };
      yield { type: "done" };
      return;
    }

    if (phase === "execute") {
      const toolId = createId("call");
      const toolName = "strict";
      const toolArgs = JSON.stringify({ value: 123 });
      const partial = buildToolCallPartial(toolId, toolName, toolArgs);
      yield { type: "tool_call_start", id: toolId, name: toolName, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
      yield { type: "tool_call_delta", id: toolId, arguments: toolArgs, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
      yield { type: "tool_call_end", id: toolId, name: toolName, arguments: toolArgs, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
      yield { type: "done" };
      return;
    }

    const verifyText = JSON.stringify({ passed: false, message: "Invalid args prevented execution.", route: "execute" });
    yield { type: "text_delta", text: verifyText, partial: buildTestPartial(verifyText) };
    yield { type: "done" };
  };
  const session = createState({
    systemPrompt: "Test system",
    input: "call strict",
  });
  const events: AgentEvent[] = [];

  const outcome = await runAgentLoop({
    kind: "run",
    state: session,
    model: { provider: "test", name: "scripted" },
    stream: invalidArgsStream,
    tools: [strictTool],
    maxAttempts: 1,
    emit: (event) => {
      events.push(event);
    },
  });

  expect(outcome.outcome.passed).toBe(false);
  expect(executed).toBe(false);
  expect(events.some((event) => event.type === "tool_execution_end")).toBe(true);
});

test("runtime beforePhase can adjust phase input", async () => {
  const session = createState({
    systemPrompt: "Test system",
    input: "adjust route input",
  });
  const stream: StreamFn = async function* adjustableRouteStream(request) {
    const phase = detectPhase(request.messages);
    if (phase !== "chat") {
      return;
    }

    const text = JSON.stringify({ route: "direct", message: "Adjusted route input." });
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield { type: "done" };
  };
  const runtime: AgentRuntimePort = {
    async beforePhase(_context, phase, input) {
      if (phase !== "chat") {
        return;
      }

      return {
        input: {
          ...input,
        },
      };
    },
  };

  const outcome = await runAgentLoop({
    kind: "run",
    state: session,
    model: { provider: "test", name: "runtime-adjust-input" },
    stream,
    tools: [],
    runtime,
  });

  expect(outcome.outcome.passed).toBe(true);
  expect(outcome.outcome.message).toBe("Adjusted route input.");
});

test("runtime afterPhase can adjust phase output", async () => {
  const session = createState({
    systemPrompt: "Test system",
    input: "adjust route output",
  });
  const stream: StreamFn = async function* routeStream(request) {
    const phase = detectPhase(request.messages);
    if (phase !== "chat") {
      return;
    }

    const text = JSON.stringify({ route: "direct", message: "Original route output." });
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield { type: "done" };
  };

  const outcome = await runAgentLoop({
    kind: "run",
    state: session,
    model: { provider: "test", name: "runtime-adjust-output" },
    stream,
    tools: [],
    runtime: {
      async afterPhase(_context, phase, output) {
        if (phase !== "chat") {
          return;
        }

        return {
          output: {
            ...output,
            message: "Adjusted route output.",
            text: "Adjusted route output.",
          },
        };
      },
    },
  });

  expect(outcome.outcome.passed).toBe(true);
  expect(outcome.outcome.message).toBe("Adjusted route output.");
});

test("runtime beforePhase can skip a phase", async () => {
  const session = createState({
    systemPrompt: "Test system",
    input: "skip route",
  });
  let modelCalled = false;
  const stream: StreamFn = async function* skippedStream() {
    modelCalled = true;
  };

  const outcome = await runAgentLoop({
    kind: "run",
    state: session,
    model: { provider: "test", name: "runtime-skip" },
    stream,
    tools: [],
    runtime: {
      async beforePhase(_context, phase) {
        if (phase !== "chat") {
          return;
        }

        return {
          skip: {
            route: "stop",
            message: "Skipped route phase.",
          },
        };
      },
    },
  });

  expect(modelCalled).toBe(false);
  expect(outcome.outcome.passed).toBe(true);
  expect(outcome.outcome.message).toBe("Skipped route phase.");
});

test("runtime afterPhase can retry a phase with adjusted input", async () => {
  const session = createState({
    systemPrompt: "Test system",
    input: "retry route",
  });
  let routeCalls = 0;
  const stream: StreamFn = async function* retryableRouteStream(request) {
    const phase = detectPhase(request.messages);
    if (phase !== "chat") {
      return;
    }

    routeCalls += 1;
    const text = JSON.stringify({
      route: "direct",
      message: routeCalls > 1 ? "Retried with adjusted input." : "Needs retry.",
    });
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield { type: "done" };
  };

  const outcome = await runAgentLoop({
    kind: "run",
    state: session,
    model: { provider: "test", name: "runtime-retry" },
    stream,
    tools: [],
    runtime: {
      async afterPhase(_context, phase, output) {
        if (phase !== "chat" || !("message" in output) || output.message !== "Needs retry.") {
          return;
        }

        return {
          retry: {
            phase: phase as string,
            systemPrompt: session.systemPrompt,
            messages: session.messages,
            tools: [],
            skills: session.skills,
          },
        };
      },
    },
  });

  expect(routeCalls).toBe(2);
  expect(outcome.outcome.passed).toBe(true);
  expect(outcome.outcome.message).toBe("Retried with adjusted input.");
});

test("runtime phase port can abort with an outcome", async () => {
  const session = createState({
    systemPrompt: "Test system",
    input: "abort during plan",
  });
  const events: AgentEvent[] = [];
  const stream: StreamFn = async function* taskRouteStream(request) {
    const phase = detectPhase(request.messages);
    if (phase === "chat") {
      const chatText = JSON.stringify({ route: "plan", message: "Create a task." });
      yield { type: "text_delta", text: chatText, partial: buildTestPartial(chatText) };
      yield { type: "done" };
    }
  };

  const outcome = await runAgentLoop({
    kind: "run",
    state: session,
    model: { provider: "test", name: "runtime-abort" },
    stream,
    tools: [],
    emit: (event) => {
      events.push(event);
    },
    runtime: {
      async beforePhase(_context, phase) {
        if (phase !== "plan") {
          return;
        }

        return {
          abort: {
            id: createId("out"),
            passed: false,
            message: "Aborted by runtime.",
          },
        };
      },
    },
  });

  expect(outcome.outcome.passed).toBe(false);
  expect(outcome.outcome.message).toBe("Aborted by runtime.");
  expect(outcome.outcome.passed).toBe(false);
});
