import { expect, test } from "bun:test";
import Type from "typebox";
import { runAgentLoop } from "../src/loop";
import { createDefaultCriteria } from "../src/task";
import type { AgentEvent, AgentRuntimePort, StreamFn, Tool } from "../src/types";
import { createAgentState as createBaseAgentState, createId, createMessage } from "../src/types";
import { echoTool } from "./support/echo-tool";
import { scriptedStream } from "./support/scripted-stream";

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
      if (phase !== "route") {
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
  expect(events).toContain("task_created");
  expect(events).toContain("tool_end");
  expect(events).toContain("verification_end");
  expect(events).toContain("outcome");
  expect(session.messages.some((message) => message.role === "tool")).toBe(false);
  expect(events.length).toBeGreaterThan(0);
});

test("runAgentLoop preserves phase messages before downstream events and tool calls", async () => {
  const task = {
    id: createId("task"),
    title: "Ordered messages",
    instruction: "Use echo with ordered messages",
    acceptanceCriteria: createDefaultCriteria("Echo evidence is present."),
    toolNames: ["echo"],
    skillIds: [],
    status: "pending" as const,
    attempts: 0,
  };
  const stream: StreamFn = async function* orderedMessageStream(_model, context) {
    if (context.phase === "route") {
      yield { type: "text_delta", text: "Routing from model." };
      yield {
        type: "structured_output",
        content: {
          route: "task",
          message: "Routing from model.",
        },
      };
      yield { type: "done" };
      return;
    }

    if (context.phase === "plan") {
      yield { type: "text_delta", text: "Planning from model." };
      yield { type: "structured_output", content: task };
      yield { type: "done" };
      return;
    }

    if (context.phase === "execute") {
      yield { type: "text_delta", text: "Executing from model." };
      yield {
        type: "tool_call",
        toolCall: {
          id: createId("call"),
          name: "echo",
          args: { message: "ordered" },
        },
      };
      yield { type: "done" };
      return;
    }

    yield { type: "text_delta", text: "Verifying from model." };
    yield {
      type: "structured_output",
      content: {
        passed: true,
        message: "Verified.",
      },
    };
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
        event.type === "message_delta" &&
        (Array.isArray(event.delta)
          ? event.delta.some((message) => message.content === content)
          : event.delta.content === content),
    );

  expect(messageIndex("Planning from model.")).toBeLessThan(
    indexOf((event) => event.type === "task_created"),
  );
  expect(messageIndex("Executing from model.")).toBeLessThan(
    indexOf((event) => event.type === "tool_requested"),
  );
  expect(messageIndex("Verifying from model.")).toBeLessThan(
    indexOf((event) => event.type === "verification_end"),
  );
  expect(session.messages.some((message) => message.content === "Planned task: Ordered messages")).toBe(false);
});

test("runAgentLoop records prompt messages emitted by the model adapter", async () => {
  const session = createState({
    systemPrompt: "Test system",
    input: "hello",
  });
  const emittedEvents: AgentEvent[] = [];
  const stream: StreamFn = async function* promptRecordingStream(model) {
    yield {
      type: "prompt_message",
      phase: "route",
      message: {
        role: "user",
        content: "Phase: route\n\nCurrent user request:\n\"hello\"",
      },
    };
    yield { type: "model_requested", phase: "route", model, usage: { inputMessages: 3 } };
    yield {
      type: "structured_output",
      content: {
        route: "direct",
        message: "Hello.",
      },
    };
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

  const promptMessage = emittedEvents.find(
    (event) =>
      event.type === "message_delta" &&
      !Array.isArray(event.delta) &&
      event.delta.metadata?.kind === "phase_prompt" &&
      event.delta.metadata.phase === "route",
  );
  const sessionPromptMessage = session.messages.find(
    (message) => message.metadata?.kind === "phase_prompt" && message.metadata.phase === "route",
  );
  const promptIndex = emittedEvents.findIndex(
    (event) =>
      event.type === "message_delta" &&
      !Array.isArray(event.delta) &&
      event.delta.metadata?.kind === "phase_prompt",
  );
  const modelRequestedIndex = emittedEvents.findIndex((event) => event.type === "model_requested");

  expect(sessionPromptMessage).toBeUndefined();
  expect(promptMessage).toEqual(
    expect.objectContaining({
      type: "message_delta",
      delta: expect.objectContaining({
        role: "user",
        content: expect.stringContaining("Phase: route"),
        metadata: expect.objectContaining({
          kind: "phase_prompt",
          phase: "route",
        }),
      }),
    }),
  );
  expect(promptIndex).toBeGreaterThan(-1);
  expect(promptIndex).toBeLessThan(modelRequestedIndex);
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
  expect(events).toContain("model_requested");
  expect(events).toContain("outcome");
  expect(events).not.toContain("task_created");
  expect(events).not.toContain("verification_start");
  expect(events.indexOf("chat_end")).toBeLessThan(events.indexOf("outcome"));
  const routeDecision = emittedEvents.find(
    (event) =>
      event.type === "message_delta" &&
      !Array.isArray(event.delta) &&
      event.delta.metadata?.kind === "routing_decision" &&
      event.delta.metadata.phase === "route",
  );
  const sessionRouteDecision = session.messages.find(
    (message) => message.metadata?.kind === "routing_decision" && message.metadata.phase === "route",
  );
  expect(sessionRouteDecision).toBeUndefined();
  expect(routeDecision).toBeUndefined();
  expect(session.messages.some((message) => message.content === "Direct response: hello")).toBe(true);
  expect(
    emittedEvents.filter(
      (event) =>
        event.type === "message_delta" &&
        !Array.isArray(event.delta) &&
        event.delta.role === "assistant" &&
        event.delta.metadata?.scope === "conversation",
    ),
  ).toHaveLength(1);
  expect(session.messages.some((message) => message.metadata?.kind === "outcome")).toBe(false);
  expect(
    emittedEvents.some(
      (event) =>
        event.type === "message_delta" &&
        !Array.isArray(event.delta) &&
        event.delta.metadata?.kind === "outcome",
    ),
  ).toBe(false);
  expect(
    emittedEvents.some(
      (event) =>
        event.type === "chat_end" &&
        event.content.some((message) => message.metadata?.kind === "outcome"),
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
  expect(events.some((event) => event.type === "tool_end")).toBe(true);
});

test("runAgentLoop preserves provider error details in error events", async () => {
  const session = createState({
    systemPrompt: "Test system",
    input: "hello",
  });
  const events: AgentEvent[] = [];
  const stream: StreamFn = async function* failingStream() {
    throw Object.assign(new Error("OpenAI-compatible request failed with status 400 Bad Request: Invalid model."), {
      code: "http_error",
      status: 400,
      retryable: false,
      details: {
        endpoint: "https://api.example/v1/chat/completions",
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
      emit: (event) => {
        events.push(event);
      },
    }),
  ).rejects.toThrow("Invalid model");

  const errorEvent = events.find((event) => event.type === "error");
  expect(errorEvent).toMatchObject({
    type: "error",
    error: {
      code: "http_error",
      message: "OpenAI-compatible request failed with status 400 Bad Request: Invalid model.",
      retryable: false,
      details: {
        endpoint: "https://api.example/v1/chat/completions",
        model: "bad-model",
        status: 400,
        providerError: {
          message: "Invalid model.",
          code: "model_not_found",
        },
      },
    },
  });
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
    acceptanceCriteria: createDefaultCriteria("Echo evidence is present."),
    toolNames: ["echo"],
    skillIds: [],
    status: "pending" as const,
    attempts: 0,
  };
  let verifyCalls = 0;
  const stream: StreamFn = async function* retryVerifyStream(model, context) {
    if (context.phase === "route") {
      yield { type: "structured_output", content: { route: "task", message: "Create task." } };
      yield { type: "done" };
      return;
    }
    if (context.phase === "plan") {
      yield { type: "structured_output", content: task };
      yield { type: "done" };
      return;
    }
    if (context.phase === "execute") {
      yield {
        type: "tool_call",
        toolCall: { id: createId("call"), name: "echo", args: { message: "retry" } },
      };
      yield { type: "done" };
      return;
    }

    verifyCalls += 1;
    yield { type: "model_requested", phase: "verify", model, usage: { inputMessages: 1 } };
    if (verifyCalls === 1) {
      throw invalidModelSchemaError("Model output for verify did not match the expected schema.");
    }
    yield {
      type: "structured_output",
      content: {
        passed: true,
        message: "Verified after retry.",
      },
    };
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
        event.type === "verification_end" &&
        event.result.message === "Model returned invalid verification output.",
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
    acceptanceCriteria: createDefaultCriteria("Echo evidence is present."),
    toolNames: ["echo"],
    skillIds: [],
    status: "pending" as const,
    attempts: 0,
  };
  let executeCalls = 0;
  let verifyCalls = 0;
  const stream: StreamFn = async function* retryExecuteStream(model, context) {
    if (context.phase === "route") {
      yield { type: "structured_output", content: { route: "task", message: "Create task." } };
      yield { type: "done" };
      return;
    }
    if (context.phase === "plan") {
      yield { type: "structured_output", content: task };
      yield { type: "done" };
      return;
    }
    if (context.phase === "execute") {
      executeCalls += 1;
      yield { type: "model_requested", phase: "execute", model, usage: { inputMessages: 1 } };
      if (executeCalls === 1) {
        throw invalidModelSchemaError("Model output for execute did not include toolCalls.");
      }
      yield {
        type: "tool_call",
        toolCall: { id: createId("call"), name: "echo", args: { message: "retry" } },
      };
      yield { type: "done" };
      return;
    }

    verifyCalls += 1;
    yield {
      type: "structured_output",
      content:
        verifyCalls === 1
          ? {
              passed: false,
              message: "Missing echo evidence.",
            }
          : {
              passed: true,
              message: "Verified after execute retry.",
            },
    };
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
  expect(events.map((event) => event.type)).toContain("tool_approval_requested");
  expect(events.map((event) => event.type)).toContain("tool_approval_result");
  expect(events.some((event) => event.type === "tool_blocked")).toBe(true);
  expect(
    events.some(
      (event) =>
        event.type === "tool_approval_result" &&
        event.toolName === "echo" &&
        !event.decision.allow &&
        event.decision.reason === "blocked in test",
    ),
  ).toBe(true);
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
  expect(events.some((event) => event.type === "tool_result_review_requested")).toBe(true);
  expect(
    events.some(
      (event) =>
        event.type === "tool_result_review_result" &&
        event.result.toolName === "echo" &&
        event.result.content === "use echo tool reviewed",
    ),
  ).toBe(true);
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
  const invalidArgsStream: StreamFn = async function* invalidArgsStream(_model, context) {
    if (context.phase === "route") {
      yield {
        type: "structured_output",
        content: {
          route: "task",
          message: "Routing invalid args task.",
        },
      };
      yield { type: "done" };
      return;
    }

    if (context.phase === "plan") {
      yield {
        type: "structured_output",
        content: {
          id: createId("task"),
          title: "Invalid args task",
          instruction: "Call strict tool",
          acceptanceCriteria: createDefaultCriteria("Strict tool should pass"),
          toolNames: ["strict"],
          skillIds: [],
          status: "pending",
          attempts: 0,
        },
      };
      yield { type: "done" };
      return;
    }

    if (context.phase === "execute") {
      yield {
        type: "tool_call",
        toolCall: {
          id: createId("call"),
          name: "strict",
          args: { value: 123 },
        },
      };
      yield { type: "done" };
      return;
    }

    yield {
      type: "structured_output",
      content: {
        passed: false,
        message: "Invalid args prevented execution.",
      },
    };
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
  expect(events.some((event) => event.type === "tool_end")).toBe(true);
});

test("runtime beforePhase can adjust phase input", async () => {
  const session = createState({
    systemPrompt: "Test system",
    input: "adjust route input",
  });
  const stream: StreamFn = async function* adjustableRouteStream(_model, context) {
    if (context.phase !== "route") {
      return;
    }

    const adjusted = context.runtime?.maxThreadDepth === 99;
    yield {
      type: "structured_output",
      content: {
        route: "direct",
        message: adjusted ? "Adjusted route input." : "Original route input.",
      },
    };
    yield { type: "done" };
  };
  const runtime: AgentRuntimePort = {
    async beforePhase(_context, phase, input) {
      if (phase !== "route") {
        return;
      }

      return {
        input: {
          ...input,
          runtime: {
            ...input.runtime,
            maxThreadDepth: 99,
          },
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
  const stream: StreamFn = async function* routeStream(_model, context) {
    if (context.phase !== "route") {
      return;
    }

    yield {
      type: "structured_output",
      content: {
        route: "direct",
        message: "Original route output.",
      },
    };
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
        if (phase !== "route") {
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
        if (phase !== "route") {
          return;
        }

        return {
          skip: {
            route: "direct",
            message: "Skipped route phase.",
            text: "Skipped route phase.",
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
  const stream: StreamFn = async function* retryableRouteStream(_model, context) {
    if (context.phase !== "route") {
      return;
    }

    routeCalls += 1;
    const adjusted = context.runtime?.maxThreadDepth === 42;
    yield {
      type: "structured_output",
      content: {
        route: "direct",
        message: adjusted ? "Retried with adjusted input." : "Needs retry.",
      },
    };
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
        if (phase !== "route" || !("message" in output) || output.message !== "Needs retry.") {
          return;
        }

        return {
          retry: {
            state: session,
            runtime: {
              threadDepth: 0,
              maxThreadDepth: 42,
            },
            tools: [],
            canStartThreadRoute: false,
            shouldDefaultToThreadRoute: false,
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
  const stream: StreamFn = async function* taskRouteStream(_model, context) {
    if (context.phase === "route") {
      yield {
        type: "structured_output",
        content: {
          route: "task",
          message: "Create a task.",
        },
      };
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
  expect(events.some((event) => event.type === "task_created")).toBe(false);
});
