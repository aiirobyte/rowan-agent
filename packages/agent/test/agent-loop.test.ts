import { expect, test } from "bun:test";
import Type from "typebox";
import { createSession as createBaseSession } from "@rowan-agent/session";
import { runAgentLoop } from "../src/agent-loop";
import { createDefaultCriteria } from "../src/task";
import type { AgentEvent, StreamFn, Tool } from "../src/types";
import { createId } from "../src/types";
import { echoTool } from "./support/echo-tool";
import { scriptedStream } from "./support/scripted-stream";

function createSession(input: Parameters<typeof createBaseSession>[0]) {
  return createBaseSession<AgentEvent>(input);
}

test("runAgentLoop completes task with echo tool and verification", async () => {
  const session = createSession({
    systemPrompt: "Test system",
    input: "use echo tool",
  });
  const events: string[] = [];

  const outcome = await runAgentLoop({
    session,
    model: { provider: "test", name: "scripted" },
    stream: scriptedStream,
    tools: [echoTool],
    emit: (event) => {
      events.push(event.type);
    },
  });

  expect(outcome.passed).toBe(true);
  expect(outcome).not.toHaveProperty("evidence");
  expect(outcome).not.toHaveProperty("failedCriteria");
  expect(events).toContain("task_created");
  expect(events).toContain("tool_end");
  expect(events).toContain("verification_end");
  expect(events).toContain("outcome");
  expect(session.messages.some((message) => message.role === "tool")).toBe(true);
  expect(session.log.length).toBeGreaterThan(0);
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
  const session = createSession({
    systemPrompt: "Test system",
    input: "use echo tool",
  });

  await runAgentLoop({
    session,
    model: { provider: "test", name: "ordered" },
    stream,
    tools: [echoTool],
    maxAttempts: 1,
  });

  const indexOf = (predicate: (event: (typeof session.log)[number]) => boolean) =>
    session.log.findIndex(predicate);
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

test("runAgentLoop can return a direct response without creating a task", async () => {
  const session = createSession({
    systemPrompt: "Test system",
    input: "hello",
  });
  const emittedEvents: AgentEvent[] = [];

  const outcome = await runAgentLoop({
    session,
    model: { provider: "test", name: "scripted" },
    stream: scriptedStream,
    tools: [echoTool],
    emit: (event) => {
      emittedEvents.push(event);
    },
  });
  const events = emittedEvents.map((event) => event.type);

  expect(outcome.passed).toBe(true);
  expect(outcome.taskId).toBeUndefined();
  expect(outcome.message).toBe("Direct response: hello");
  expect(events).toContain("model_requested");
  expect(events).toContain("outcome");
  expect(events).not.toContain("task_created");
  expect(events).not.toContain("verification_start");
  expect(events.indexOf("chat_end")).toBeLessThan(events.indexOf("outcome"));
  const routeDecision = session.messages.find(
    (message) => message.metadata?.kind === "routing_decision" && message.metadata.phase === "route",
  );
  expect(JSON.parse(routeDecision?.content ?? "{}")).toEqual({
    route: "direct",
    message: "Direct response: hello",
  });
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
  const session = createSession({
    systemPrompt: "Test system",
    input: "use echo tool",
  });

  const outcome = await runAgentLoop({
    session,
    model: { provider: "test", name: "scripted" },
    stream: scriptedStream,
    tools: [],
    maxAttempts: 1,
  });

  expect(outcome.passed).toBe(false);
  expect(session.log.some((event) => event.type === "tool_end")).toBe(true);
});

test("runAgentLoop preserves provider error details in error events", async () => {
  const session = createSession({
    systemPrompt: "Test system",
    input: "hello",
  });
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
      session,
      model: { provider: "test", name: "failing" },
      stream,
      tools: [echoTool],
    }),
  ).rejects.toThrow("Invalid model");

  const errorEvent = session.log.find((event) => event.type === "error");
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
  const session = createSession({
    systemPrompt: "Test system",
    input: "use echo tool",
  });
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
    session,
    model: { provider: "test", name: "retry-verify" },
    stream,
    tools: [echoTool],
    maxAttempts: 2,
  });

  expect(outcome.passed).toBe(true);
  expect(outcome.message).toBe("Verified after retry.");
  expect(verifyCalls).toBe(2);
  expect(
    session.log.some(
      (event) =>
        event.type === "verification_end" &&
        event.result.message === "Model returned invalid verification output.",
    ),
  ).toBe(true);
});

test("runAgentLoop retries when execute returns invalid model schema", async () => {
  const session = createSession({
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
    session,
    model: { provider: "test", name: "retry-execute" },
    stream,
    tools: [echoTool],
    maxAttempts: 2,
  });

  expect(outcome.passed).toBe(true);
  expect(outcome.message).toBe("Verified after execute retry.");
  expect(executeCalls).toBe(2);
  expect(session.messages.some((message) => message.metadata?.toolName === "model.execute")).toBe(true);
});

test("beforeToolCall hook can block execution", async () => {
  const session = createSession({
    systemPrompt: "Test system",
    input: "use echo tool",
  });
  const events: string[] = [];

  const outcome = await runAgentLoop({
    session,
    model: { provider: "test", name: "scripted" },
    stream: scriptedStream,
    tools: [echoTool],
    maxAttempts: 1,
    beforeToolCall: async () => ({ allow: false, reason: "blocked in test" }),
    emit: (event) => {
      events.push(event.type);
    },
  });

  expect(outcome.passed).toBe(false);
  expect(events).toContain("tool_approval_requested");
  expect(events).toContain("tool_approval_result");
  expect(session.log.some((event) => event.type === "tool_blocked")).toBe(true);
  expect(
    session.log.some(
      (event) =>
        event.type === "tool_approval_result" &&
        event.toolName === "echo" &&
        !event.decision.allow &&
        event.decision.reason === "blocked in test",
    ),
  ).toBe(true);
});

test("afterToolCall hook review is logged with original and reviewed result", async () => {
  const session = createSession({
    systemPrompt: "Test system",
    input: "use echo tool",
  });

  const outcome = await runAgentLoop({
    session,
    model: { provider: "test", name: "scripted" },
    stream: scriptedStream,
    tools: [echoTool],
    afterToolCall: async ({ result }) => ({
      ...result,
      content: `${result.content} reviewed`,
    }),
  });

  expect(outcome.passed).toBe(true);
  expect(session.log.some((event) => event.type === "tool_result_review_requested")).toBe(true);
  expect(
    session.log.some(
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
  const session = createSession({
    systemPrompt: "Test system",
    input: "call strict",
  });

  const outcome = await runAgentLoop({
    session,
    model: { provider: "test", name: "scripted" },
    stream: invalidArgsStream,
    tools: [strictTool],
    maxAttempts: 1,
  });

  expect(outcome.passed).toBe(false);
  expect(executed).toBe(false);
  expect(session.log.some((event) => event.type === "tool_end")).toBe(true);
});
